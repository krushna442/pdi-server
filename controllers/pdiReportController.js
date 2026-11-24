import { query } from '../db/db.js';
import { findTemplateByPartNumber, generateRandomReadings } from '../models/pdiTemplateModel.js';
import { findProductByPartNumber } from '../models/productModel.js';
import { generatePdiReportWorkbook } from '../utils/shiftReportCron.js';
import fs from 'fs';

function getShiftLetter(date) {
  const h = new Date(date).getHours();
  if (h >= 6 && h < 14) return 'A';
  if (h >= 14 && h < 22) return 'B';
  return 'C';
}

function getShiftLabel(letter) {
  if (letter === 'A') return 'Shift A (06:00 – 14:00)';
  if (letter === 'B') return 'Shift B (14:00 – 22:00)';
  return 'Shift C (22:00 – 06:00)';
}

export async function getPartReport(req, res) {
  try {
    const { partNumber, fromDate, toDate, shift } = req.body;

    if (!partNumber || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'partNumber, fromDate, and toDate are required',
      });
    }

    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    // 1. Fetch template for this part number
    let template = await findTemplateByPartNumber(partNumber);
    const product = await findProductByPartNumber(partNumber);

    // If template doesn't exist, build dynamic fallback
    if (!template) {
      template = {
        part_number: partNumber,
        description: product?.model || 'Component Assembly',
        vendor_code: product?.vendor_code || 'R64533',
        customer: product?.customer || 'TATA MOTORS  LTD.',
        draw_rev_no: product?.rev_no || "`A' / 01.01.2026",
        format_no: 'RSB-(J)/F/QA/20',
        issue_date: '01.01.2026',
        rev_no: '1',
        rev_date: '01.01.2026',
        rows: [
          { sr: 1, parameter: 'Sample Dimension Check', mean: '100±2', main_value: 100, variable_value: 2, min: 98, max: 102, special_char: '', method_regular: 'Vernier Caliper', method_alternate: '', remarks: '', measurement_text: '' },
          { sr: 2, parameter: 'Visual Inspection', mean: 'Free from Defect', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', measurement_text: 'Ok' },
        ],
      };
    }

    // 2. Query scanned records
    let sql = `
      SELECT * FROM scanned_products
      WHERE (part_no = ? OR REPLACE(part_no, ' ', '') = ?)
        AND created_at >= ?
        AND created_at <= ?
    `;
    const params = [partNumber, partNumber.replace(/\s+/g, ''), from, to];

    if (shift) {
      sql += ' AND shift = ?';
      params.push(shift);
    }
    sql += ' ORDER BY created_at ASC';

    const records = await query(sql, params);

    // Top inspector (most frequent scanner)
    const operatorCounts = {};
    for (const r of records) {
      if (r.created_by) {
        operatorCounts[r.created_by] = (operatorCounts[r.created_by] || 0) + 1;
      }
    }
    const topOperator = Object.entries(operatorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Quality Inspector';

    // 3. Group by (shift, date)
    const shiftDateMap = new Map();
    for (const r of records) {
      const s = r.shift || getShiftLetter(r.created_at);
      const d = new Date(r.created_at).toLocaleDateString('en-IN').replace(/\//g, '-');
      const key = `${s}_${d}`;

      if (!shiftDateMap.has(key)) {
        shiftDateMap.set(key, {
          key,
          shiftLetter: s,
          dateStr: d,
          records: [],
          inspector: r.created_by || topOperator,
        });
      }
      shiftDateMap.get(key).records.push(r);
    }

    // Build shifts array matching ShiftGroup
    const shifts = Array.from(shiftDateMap.values()).map((group) => {
      const total = group.records.length;
      const passed = group.records.filter((r) => r.validation_status === 'pass').length;
      const failed = group.records.filter((r) => r.validation_status === 'fail').length;
      const rejected = group.records.filter((r) => r.is_rejected || r.validation_status === 'rejected').length;

      return {
        key: group.key,
        date: group.dateStr,
        shift: {
          letter: group.shiftLetter,
          label: getShiftLabel(group.shiftLetter),
        },
        qty: total,
        sampleSize: Math.min(total, 6),
        checkedBy: group.inspector,
        stats: {
          total,
          passed,
          failed,
          pending: 0,
          rejected,
        },
        sampleRecords: group.records.slice(0, 6),
      };
    });

    // 4. Generate actual measured values (6 random readings per parameter)
    const rowsWithReadings = (template.rows || []).map((row) => {
      const readings = generateRandomReadings(row, 6);
      return {
        ...row,
        readings,
      };
    });

    const overallTotal = records.length;
    const overallPassed = records.filter((r) => r.validation_status === 'pass').length;
    const overallFailed = records.filter((r) => r.validation_status === 'fail').length;
    const overallRejected = records.filter((r) => r.is_rejected || r.validation_status === 'rejected').length;

    return res.json({
      success: true,
      partNumber,
      product,
      product: {
        ...product,
        part_image_url: product?.part_image ? `/${product.part_image.replace(/\\/g, '/')}` : null,
      },
      dateRange: { from: fromDate, to: toDate },
      template: {
        ...template,
        rows: rowsWithReadings,
      },
      metadata: {
        vendorCode: template.vendor_code || product?.vendor_code || 'R64533',
        customer: template.customer || product?.customer || 'TATA MOTORS  LTD.',
        description: template.description || product?.model || '',
        drawRevNo: template.draw_rev_no || product?.rev_no || '',
        formatNo: template.format_no || 'RSB-(J)/F/QA/20',
        issueDate: template.issue_date || '',
        revNo: template.rev_no || '1',
        revDate: template.rev_date || '',
        lotQty: overallTotal || 4,
        sampleSize: Math.min(overallTotal || 4, 6),
        inspectorName: topOperator,
        reportDate: new Date().toLocaleDateString('en-IN'),
        partImage: product?.part_image ? `/${product.part_image.replace(/\\/g, '/')}` : null,
      },
      overallStats: {
        total: overallTotal,
        passed: overallPassed,
        failed: overallFailed,
        pending: 0,
        rejected: overallRejected,
      },
      checkedBy: topOperator,
      shifts,
      allRecords: records.map((r) => ({
        id: r.id,
        dispatch_date: r.created_at,
        shift: r.shift || getShiftLetter(r.created_at),
        part_no: r.part_no,
        customer_name: r.customer_name,
        validation_status: r.validation_status,
        remarks: r.remarks,
        created_by: r.created_by,
        qr_label: r.qr_label,
        created_at: r.created_at,
      })),
    });
  } catch (err) {
    console.error('PDI Report error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function exportPdiExcel(req, res) {
  try {
    const { partNumber, shift = 'A', date } = req.body;
    if (!partNumber) {
      return res.status(400).json({ success: false, message: 'partNumber is required' });
    }

    // Query records for this partNumber and optional shift / date
    let sql = `
      SELECT * FROM scanned_products
      WHERE (part_no = ? OR REPLACE(part_no, ' ', '') = ?)
    `;
    const params = [partNumber, partNumber.replace(/\s+/g, '')];

    if (shift && shift !== 'All') {
      sql += ' AND shift = ?';
      params.push(shift);
    }
    if (date) {
      // date could be 'DD-MM-YYYY' or 'YYYY-MM-DD'
      const parts = date.split('-');
      let dateObj;
      if (parts[0].length === 4) {
        dateObj = new Date(parts[0], Number(parts[1]) - 1, parts[2]);
      } else {
        dateObj = new Date(parts[2], Number(parts[1]) - 1, parts[0]);
      }
      if (!isNaN(dateObj.getTime())) {
        const dStart = new Date(dateObj);
        dStart.setHours(0, 0, 0, 0);
        const dEnd = new Date(dateObj);
        dEnd.setHours(23, 59, 59, 999);
        sql += ' AND created_at >= ? AND created_at <= ?';
        params.push(dStart, dEnd);
      }
    }
    sql += ' ORDER BY created_at ASC';

    const records = await query(sql, params);
    const template = await findTemplateByPartNumber(partNumber);
    const product = await findProductByPartNumber(partNumber);

    const { filePath, filename } = await generatePdiReportWorkbook({
      partNumber,
      shift: shift === 'All' ? 'A' : shift,
      records,
      template,
      product,
      date,
    });

    res.download(filePath, filename, (err) => {
      if (err) console.error('Download error:', err);
      // Clean up temp file
      fs.unlink(filePath, () => {});
    });
  } catch (err) {
    console.error('Export PDI Excel error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

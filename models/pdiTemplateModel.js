import { query, queryOne, execute } from '../db/db.js';
import * as XLSX from 'xlsx';

export async function initPdiTemplatesTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS pdi_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      part_number VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(255) DEFAULT '',
      vendor_code VARCHAR(100) DEFAULT '',
      customer VARCHAR(150) DEFAULT '',
      draw_rev_no VARCHAR(100) DEFAULT '',
      format_no VARCHAR(100) DEFAULT 'RSB-(J)/F/QA/20',
      issue_date VARCHAR(50) DEFAULT '',
      rev_no VARCHAR(50) DEFAULT '',
      rev_date VARCHAR(50) DEFAULT '',
      rows_json LONGTEXT NOT NULL,
      updated_by VARCHAR(100) DEFAULT 'system',
      status VARCHAR(50) DEFAULT 'active',
      created_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_part (part_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  // Seed default templates for the two part numbers if not present
  await seedDefaultTemplates();
}

/**
 * Generate 6 truly random readings uniformly between min and max (or mean +- range)
 * Ensures values are random and NOT a sequential increment.
 */
export function generateRandomReadings(row, count = 6) {
  const readings = [];

  // If this is a visual / non-numeric check, return specified measurement_text or standard acceptance status
  const isVar = (row.min !== null && row.min !== '' && row.min !== undefined && !isNaN(Number(row.min))) ||
                (row.max !== null && row.max !== '' && row.max !== undefined && !isNaN(Number(row.max))) ||
                (row.variable_value !== null && row.variable_value !== '' && row.variable_value !== undefined && !isNaN(Number(row.variable_value)));

  if (row.type === 'visual' || row.type === 'text' || !isVar) {
    let defaultVal = 'Ok';
    if (row.measurement_text && typeof row.measurement_text === 'string' && row.measurement_text.trim().length > 0 && row.measurement_text.trim().length <= 15) {
      defaultVal = row.measurement_text.trim();
    }
    for (let i = 0; i < count; i++) {
      readings.push(defaultVal);
    }
    return readings;
  }

  // Determine numeric boundaries
  let min = row.min !== undefined && row.min !== null && !isNaN(Number(row.min)) ? Number(row.min) : null;
  let max = row.max !== undefined && row.max !== null && !isNaN(Number(row.max)) ? Number(row.max) : null;
  const mainVal = row.main_value !== undefined && row.main_value !== null && !isNaN(Number(row.main_value)) ? Number(row.main_value) : null;
  const varVal = row.variable_value !== undefined && row.variable_value !== null && !isNaN(Number(row.variable_value)) ? Number(row.variable_value) : null;

  if (min === null && max === null) {
    if (mainVal !== null && varVal !== null) {
      min = mainVal - varVal;
      max = mainVal + varVal;
    } else if (mainVal !== null) {
      min = mainVal;
      max = mainVal;
    }
  } else if (min === null && max !== null) {
    min = 0;
  } else if (max === null && min !== null) {
    max = min + (varVal || 2);
  }

  if (min === null || max === null || isNaN(min) || isNaN(max)) {
    // Fallback to text reading if bounds cannot be resolved
    for (let i = 0; i < count; i++) readings.push(row.measurement_text || row.mean || 'Ok');
    return readings;
  }

  // Check if either bound or step has decimals
  const isDecimal = String(min).includes('.') || String(max).includes('.') || (varVal !== null && String(varVal).includes('.'));
  const precision = isDecimal ? 2 : 0;

  for (let i = 0; i < count; i++) {
    // Generate random value between min and max with slight margin to stay comfortably inside tolerance
    const raw = min + Math.random() * (max - min);
    if (precision === 0) {
      readings.push(Math.round(raw));
    } else {
      readings.push(Number(raw.toFixed(precision)));
    }
  }

  return readings;
}

const parseTemplateRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    rows: typeof row.rows_json === 'string' ? JSON.parse(row.rows_json) : (row.rows_json || []),
  };
};

export async function findAllTemplates() {
  const rows = await query('SELECT * FROM pdi_templates ORDER BY part_number ASC');
  return rows.map(parseTemplateRow);
}

export async function findTemplateByPartNumber(partNumber) {
  if (!partNumber) return null;
  const cleanPart = partNumber.trim();
  const row = await queryOne('SELECT * FROM pdi_templates WHERE part_number = ?', [cleanPart]);
  if (row) return parseTemplateRow(row);

  const noSpace = cleanPart.replace(/\s+/g, '');
  const row2 = await queryOne("SELECT * FROM pdi_templates WHERE REPLACE(part_number, ' ', '') = ?", [noSpace]);
  return parseTemplateRow(row2);
}

export async function findTemplateById(id) {
  const row = await queryOne('SELECT * FROM pdi_templates WHERE id = ?', [id]);
  return parseTemplateRow(row);
}

export async function saveTemplate({
  part_number,
  description = '',
  vendor_code = '',
  customer = '',
  draw_rev_no = '',
  format_no = 'RSB-(J)/F/QA/20',
  issue_date = '',
  rev_no = '',
  rev_date = '',
  rows = [],
  updated_by = 'admin',
}) {
  const existing = await findTemplateByPartNumber(part_number);

  if (existing) {
    await execute(
      `UPDATE pdi_templates SET
        description = ?,
        vendor_code = ?,
        customer = ?,
        draw_rev_no = ?,
        format_no = ?,
        issue_date = ?,
        rev_no = ?,
        rev_date = ?,
        rows_json = ?,
        updated_by = ?
       WHERE id = ?`,
      [
        description,
        vendor_code,
        customer,
        draw_rev_no,
        format_no,
        issue_date,
        rev_no,
        rev_date,
        JSON.stringify(rows),
        updated_by,
        existing.id,
      ]
    );
    return findTemplateById(existing.id);
  } else {
    const result = await execute(
      `INSERT INTO pdi_templates (
        part_number, description, vendor_code, customer, draw_rev_no,
        format_no, issue_date, rev_no, rev_date, rows_json, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        part_number.trim(),
        description,
        vendor_code,
        customer,
        draw_rev_no,
        format_no,
        issue_date,
        rev_no,
        rev_date,
        JSON.stringify(rows),
        updated_by,
      ]
    );
    return findTemplateById(result.insertId);
  }
}

export async function deleteTemplate(id) {
  return await execute('DELETE FROM pdi_templates WHERE id = ?', [id]);
}

/**
 * Excel Parser: Parses an uploaded PDI Report Excel or CSV into template structure
 */
export function parsePdiExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  const metadata = {
    part_number: '',
    vendor_code: '',
    description: '',
    customer: '',
    draw_rev_no: '',
    format_no: 'RSB-(J)/F/QA/20',
    issue_date: '',
    rev_no: '',
    rev_date: '',
    rows: [],
  };

  let rowsStartIndex = -1;
  let currentCategory = 'A) Dimension parameters';

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i].map((cell) => String(cell || '').trim());
    const fullLine = row.join(' ').toLowerCase();

    // Look for header fields
    for (let c = 0; c < row.length; c++) {
      const val = row[c].toLowerCase();
      if (val.includes('part no.')) {
        metadata.part_number = row[c + 1] ? row[c + 1].replace(/[`']/g, '').trim() : '';
      }
      if (val.includes('vendor code')) {
        metadata.vendor_code = row[c + 1] ? row[c + 1].trim() : '';
      }
      if (val.includes('customer:')) {
        metadata.customer = row[c + 1] ? row[c + 1].trim() : '';
      }
      if (val.includes('description:')) {
        metadata.description = row[c + 1] ? row[c + 1].trim() : '';
      }
      if (val.includes('draw. rev. no')) {
        metadata.draw_rev_no = row[c + 1] ? row[c + 1].trim() : '';
      }
      if (val.includes('format no.')) {
        metadata.format_no = row[c + 1] ? row[c + 1].trim() : metadata.format_no;
      }
      if (val.includes('issue date')) {
        metadata.issue_date = row[c + 1] ? row[c + 1].trim() : '';
      }
      if (val.includes('rev.no.')) {
        metadata.rev_no = row[c + 1] ? row[c + 1].trim() : '';
      }
      if (val.includes('rev. date')) {
        metadata.rev_date = row[c + 1] ? row[c + 1].trim() : '';
      }
    }

    if (fullLine.includes('parameters') && (fullLine.includes('mean') || fullLine.includes('specification'))) {
      rowsStartIndex = i + 1;
      // Skip subheader row (MEAN, MAX, MIN)
      if (rawData[rowsStartIndex] && rawData[rowsStartIndex].some((c) => String(c).toLowerCase().includes('mean'))) {
        rowsStartIndex++;
      }
      break;
    }
  }

  if (rowsStartIndex > -1) {
    let srCounter = 1;
    for (let i = rowsStartIndex; i < rawData.length; i++) {
      const r = rawData[i].map((cell) => String(cell || '').trim());
      const firstCell = r[0] || '';
      const secondCell = r[1] || '';

      // Check section headers
      if (firstCell.startsWith('B)') || secondCell.startsWith('B)')) {
        currentCategory = 'B) Customer end complaint parameters & Check points';
        continue;
      }
      if (firstCell.startsWith('C)') || secondCell.startsWith('C)')) {
        currentCategory = 'C) Material Grade';
        continue;
      }
      if (firstCell.startsWith('D)') || secondCell.startsWith('D)')) {
        currentCategory = 'D) Surface coating';
        continue;
      }
      if (firstCell.toLowerCase().includes('inspector') || secondCell.toLowerCase().includes('inspector')) {
        break; // Reached footer
      }

      const param = secondCell || firstCell;
      if (!param && !r[2]) continue;

      const meanRaw = r[2] || '';
      const maxRaw = r[3] || '';
      const minRaw = r[4] || '';
      const specialChar = r[5] || '';
      const methodReg = r[6] || '';
      const methodAlt = r[7] || '';
      const remarks = r[14] || r[13] || '';

      // Parse main_value and variable_value from meanRaw (e.g. 275±7, 331±10, 886-2)
      let main_value = null;
      let variable_value = null;
      let minVal = parseFloat(minRaw) || null;
      let maxVal = parseFloat(maxRaw) || null;
      let type = 'visual';

      if (meanRaw.includes('±')) {
        const parts = meanRaw.split('±');
        main_value = parseFloat(parts[0]);
        variable_value = parseFloat(parts[1]);
        type = 'dimension';
        if (minVal === null && !isNaN(main_value) && !isNaN(variable_value)) minVal = main_value - variable_value;
        if (maxVal === null && !isNaN(main_value) && !isNaN(variable_value)) maxVal = main_value + variable_value;
      } else if (!isNaN(parseFloat(minRaw)) || !isNaN(parseFloat(maxRaw))) {
        type = 'dimension';
        main_value = parseFloat(meanRaw) || null;
        if (minVal !== null && maxVal !== null && main_value === null) {
          main_value = (minVal + maxVal) / 2;
          variable_value = (maxVal - minVal) / 2;
        }
      }

      const actualReading = r[8] || '';
      const measurementText = type === 'visual' ? (actualReading || meanRaw || 'Ok') : (actualReading || '');

      metadata.rows.push({
        sr: parseInt(firstCell) || srCounter++,
        parameter: param,
        mean: meanRaw,
        main_value,
        variable_value,
        min: minVal,
        max: maxVal,
        special_char: specialChar,
        method_regular: methodReg,
        method_alternate: methodAlt,
        measurement_text: measurementText,
        remarks,
        type,
      });
    }
  }

  return metadata;
}

/**
 * Pre-seed the two templates supplied in prompt
 */
async function seedDefaultTemplates() {
  const tpl148 = await queryOne('SELECT id FROM pdi_templates WHERE part_number = ?', ['5081 3420 0148']);
  if (!tpl148) {
    console.log('[Templates] Seeding template for Part 5081 3420 0148...');
    const rows148 = [
      { sr: 1, category: 'A) Dimension parameters', parameter: 'Height', mean: '331±10', main_value: 331, variable_value: 10, min: 321, max: 341, special_char: '', method_regular: 'Vernier Height Gauge-600', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 2, category: 'A) Dimension parameters', parameter: 'Height', mean: '210±5', main_value: 210, variable_value: 5, min: 205, max: 215, special_char: '', method_regular: 'Vernier Height Gauge-600', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 3, category: 'A) Dimension parameters', parameter: 'Movement angle', mean: '7° Min', main_value: 7.5, variable_value: 0.5, min: 7, max: 8.5, special_char: '', method_regular: 'Digital bevel Protractor', method_alternate: 'Bevel protractor', remarks: '', type: 'dimension' },
      { sr: 4, category: 'A) Dimension parameters', parameter: 'Total Width', mean: '886-2', main_value: 885, variable_value: 1, min: 884, max: 886, special_char: '', method_regular: 'Meter tap', method_alternate: 'Vernier Caliper', remarks: '', type: 'dimension' },
      { sr: 5, category: 'A) Dimension parameters', parameter: 'Stopper side distance', mean: '30±2.0', main_value: 30, variable_value: 2.0, min: 28, max: 32, special_char: '', method_regular: 'Vernier caliper', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 6, category: 'A) Dimension parameters', parameter: 'Handle pulling force', mean: '47.5 - 52.5 Kg', main_value: 50.0, variable_value: 2.5, min: 47.5, max: 52.5, special_char: '', method_regular: 'Push Pull Meter', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 7, category: 'A) Dimension parameters', parameter: 'Hole dia in Mtg plate (8nos)', mean: 'Ø18+0.3', main_value: 18.15, variable_value: 0.15, min: 18.0, max: 18.3, special_char: '', method_regular: 'Vernier caliper', method_alternate: 'Vernier caliper', remarks: '', type: 'dimension' },
      { sr: 8, category: 'A) Dimension parameters', parameter: 'Threaded hole after re-tapping (20 nos)', mean: 'M12X1.5 H6', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Go/NoGo Thread plug gauge', method_alternate: 'Matting Bolt', remarks: '', type: 'visual' },
      { sr: 9, category: 'A) Dimension parameters', parameter: '2 Holes', mean: 'Free from Nut', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 10, category: 'A) Dimension parameters', parameter: 'Hole Distance Mtg plate to structure', mean: '50±0.8', main_value: 50.0, variable_value: 0.8, min: 49.2, max: 50.8, special_char: '', method_regular: 'Vernier Caliper', method_alternate: 'Vernier Height Gauge-600', remarks: '', type: 'dimension' },
      { sr: 11, category: 'A) Dimension parameters', parameter: 'Hole Distance Mtg plate to structure', mean: '45±1.0', main_value: 45.0, variable_value: 1.0, min: 44.0, max: 46.0, special_char: '', method_regular: 'Gauge', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 12, category: 'A) Dimension parameters', parameter: 'Tracibility Ingraving RH Rear side', mean: 'Part no. , Part Serial no. & MFG Month & Year', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 13, category: 'A) Dimension parameters', parameter: "Sticker's tick marks", mean: 'Fitment, Name plate & QR Code', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 14, category: 'A) Dimension parameters', parameter: 'M10 Bolt thread should be come out from Nylock Nut', mean: '2 thread Min', main_value: 2, variable_value: 1, min: 2, max: 4, special_char: '', method_regular: 'Count', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 15, category: 'A) Dimension parameters', parameter: 'Torque in 16nos. Flange nut', mean: '285-315 NM', main_value: 300, variable_value: 15, min: 285, max: 315, special_char: '', method_regular: 'Torque Meter', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 16, category: 'A) Dimension parameters', parameter: 'Identification after 100% Torque on Flange nut', mean: 'Line marks', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 17, category: 'A) Dimension parameters', parameter: 'Wax Application', mean: 'As per SOP Apply on all outer welding beads & Stoppers', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 18, category: 'A) Dimension parameters', parameter: 'All Stoppers & Mtg plate/Structure welded gap', mean: '0.8mm Max', main_value: 0.4, variable_value: 0.4, min: 0.0, max: 0.8, special_char: '', method_regular: 'Feeler gauge', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 19, category: 'A) Dimension parameters', parameter: 'Weld miss in Structure Ribs & Stoppers', mean: 'Free from Weld missing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 20, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from pin hole porosity, Blow holes, Undercut & Improper weld bead', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 21, category: 'A) Dimension parameters', parameter: 'Welding inspection arround part for no weld miss', mean: 'Tick marks', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 22, category: 'A) Dimension parameters', parameter: 'Free from Part missing', mean: 'BOM comprehension as per drawing (Free from part missing)', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 23, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from Dent', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 24, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from Scratch', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 25, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from weld spatters', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 26, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from sharp edges', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 27, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from Burrs', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 28, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Line mark on M10 Bolt after 100% torquing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 29, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from paint miss', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 30, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from shots/weld spatters on Top plate & King pin entrence area', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 31, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from Deep notch marks', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 32, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% line mark on M12X1.75 Socket head bolt after torquing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 33, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% line mark on Flange nut & bolt M16X1.5X55 to ensure bolt length', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 34, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Apply grease on Jaw pivot pin & wedge movement', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 35, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% Tick marks on Leg bend plate for No dent after aticulation check', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 36, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Articulation stopper gap after rest LH/RH - Max 3mm', main_value: 1.5, variable_value: 1.5, min: 0.0, max: 3.0, special_char: '', method_regular: 'Feeler Gauge', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 37, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% Tick marks on Mtg pin for No R-PIN missing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 38, category: 'B) Customer end complaint parameters & Check points', parameter: 'Customer Complaint', mean: 'No Customer Complaint last one Year', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 39, category: 'C) Material Grade', parameter: 'Material Grade', mean: 'Proprieitary Item of RSB', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 40, category: 'D) Surface coating', parameter: 'CED coating DFT', mean: 'Coating thickness 20π Min.', main_value: 23.0, variable_value: 2.0, min: 20.0, max: 28.0, special_char: '', method_regular: 'Coating Thickness Gauge', method_alternate: '', remarks: '', type: 'dimension' },
    ];

    await execute(
      `INSERT INTO pdi_templates (
        part_number, description, vendor_code, customer, draw_rev_no,
        format_no, issue_date, rev_no, rev_date, rows_json, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '5081 3420 0148',
        'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)',
        'R64533',
        'TATA MOTORS  LTD.',
        "`C' / 05.06.2025",
        'RSB-(J)/F/QA/20',
        '20.10.2024',
        '6',
        '02.05.2025',
        JSON.stringify(rows148),
        'system',
      ]
    );
  }

  const tpl143 = await queryOne('SELECT id FROM pdi_templates WHERE part_number = ?', ['5081 3420 0143']);
  if (!tpl143) {
    console.log('[Templates] Seeding template for Part 5081 3420 0143...');
    const rows143 = [
      { sr: 1, category: 'A) Dimension parameters', parameter: 'Height', mean: '275±7', main_value: 275, variable_value: 7, min: 268, max: 282, special_char: '', method_regular: 'Vernier Height Gauge-600', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 2, category: 'A) Dimension parameters', parameter: 'Height', mean: '210±5', main_value: 210, variable_value: 5, min: 205, max: 215, special_char: '', method_regular: 'Vernier Height Gauge-600', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 3, category: 'A) Dimension parameters', parameter: 'Total Width', mean: '886-2', main_value: 885, variable_value: 1, min: 884, max: 886, special_char: '', method_regular: 'Meter tap', method_alternate: 'Vernier Caliper', remarks: '', type: 'dimension' },
      { sr: 4, category: 'A) Dimension parameters', parameter: 'Stopper side distance', mean: '30±2.0', main_value: 30, variable_value: 2.0, min: 28, max: 32, special_char: '', method_regular: 'Vernier caliper', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 5, category: 'A) Dimension parameters', parameter: 'Hole dia in Mtg plate (8nos)', mean: 'Ø18+0.3', main_value: 18.15, variable_value: 0.15, min: 18.0, max: 18.3, special_char: '', method_regular: 'Vernier caliper', method_alternate: 'Vernier caliper', remarks: '', type: 'dimension' },
      { sr: 6, category: 'A) Dimension parameters', parameter: 'Threaded hole after re-tapping (20 nos)', mean: 'M12X1.5 H6', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Go/NoGo Thread plug gauge', method_alternate: 'Matting Bolt', remarks: '', type: 'visual' },
      { sr: 7, category: 'A) Dimension parameters', parameter: '2 Holes', mean: 'Free from Nut', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 8, category: 'A) Dimension parameters', parameter: 'Hole Distance Mtg plate to structure', mean: '36±0.8', main_value: 36.0, variable_value: 0.8, min: 35.2, max: 36.8, special_char: '', method_regular: 'Vernier Caliper', method_alternate: 'Vernier Height Gauge-600', remarks: '', type: 'dimension' },
      { sr: 9, category: 'A) Dimension parameters', parameter: 'Hole Distance Mtg plate to structure', mean: '45±1.0', main_value: 45.0, variable_value: 1.0, min: 44.0, max: 46.0, special_char: '', method_regular: 'Gauge', method_alternate: 'Meter tape', remarks: '', type: 'dimension' },
      { sr: 10, category: 'A) Dimension parameters', parameter: 'Tracibility Ingraving RH Rear side', mean: 'Part no. , Part Serial no. & MFG Month & Year', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 11, category: 'A) Dimension parameters', parameter: "Sticker's tick marks", mean: 'Fitment, Name plate, Part no & QR Code', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 12, category: 'A) Dimension parameters', parameter: 'M10 Bolt thread should be come out from Nylock Nut', mean: '2 thread Min', main_value: 2, variable_value: 1, min: 2, max: 4, special_char: '', method_regular: 'Count', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 13, category: 'A) Dimension parameters', parameter: 'Torque in 16nos. Flange nut', mean: '285-315 NM', main_value: 300, variable_value: 15, min: 285, max: 315, special_char: '', method_regular: 'Torque Meter', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 14, category: 'A) Dimension parameters', parameter: 'Identification after 100% Torque on Flange nut', mean: 'Line marks', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 15, category: 'A) Dimension parameters', parameter: 'Wax Application', mean: 'As per SOP Apply on all outer welding beads & Stoppers', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 16, category: 'A) Dimension parameters', parameter: 'All Stoppers & Mtg plate/Structure welded gap', mean: '1.2 mm Max', main_value: 0.6, variable_value: 0.6, min: 0.0, max: 1.2, special_char: '', method_regular: 'Feeler gauge', method_alternate: '', remarks: '', type: 'dimension' },
      { sr: 17, category: 'A) Dimension parameters', parameter: 'Weld miss in Structure Ribs & Stoppers', mean: 'Free from Weld missing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 18, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from pin hole porosity, Blow holes, Undercut & Improper weld bead', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 19, category: 'A) Dimension parameters', parameter: 'Welding inspection arround part for no weld miss', mean: 'Tick marks', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 20, category: 'A) Dimension parameters', parameter: 'Free from Part missing', mean: 'BOM comprehension as per drawing (Free from part missing)', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 21, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from Dent', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 22, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from Scratch', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 23, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from weld spatters', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 24, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from sharp edges', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 25, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from Burrs', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 26, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Line mark on M10 Bolt after 100% torquing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 27, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from paint miss', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 28, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Free from shots/weld spatters on Top plate & King pin entrence area', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 29, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% line mark on M12X1.75 Socket head bolt after torquing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 30, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% line mark on Flange nut & bolt M16X1.5X55 to ensure bolt length', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 31, category: 'A) Dimension parameters', parameter: 'Appearance', mean: 'Apply grease on Grip bush, Jaw pivot pin & wedge movement', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 32, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% Tick marks on Leg bend plate for No dent/V-notch after aticulation check', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 33, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% tick marks after check Free from undercut on bearing plate or any welding area', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 34, category: 'A) Dimension parameters', parameter: 'Appearance', mean: '100% Tick marks on Mtg pin for No R-PIN missing', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 35, category: 'B) Customer end complaint parameters & Check points', parameter: 'Customer Complaint', mean: 'No Customer Complaint last one Year', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 36, category: 'C) Material Grade', parameter: 'Material Grade', mean: 'Proprieitary Item of RSB', main_value: null, variable_value: null, min: null, max: null, special_char: '', method_regular: 'Visual', method_alternate: '', remarks: '', type: 'visual' },
      { sr: 37, category: 'D) Surface coating', parameter: 'CED coating DFT', mean: 'Coating thickness 20π Min.', main_value: 23.0, variable_value: 2.0, min: 20.0, max: 28.0, special_char: '', method_regular: 'Coating Thickness Gauge', method_alternate: '', remarks: '', type: 'dimension' },
    ];

    await execute(
      `INSERT INTO pdi_templates (
        part_number, description, vendor_code, customer, draw_rev_no,
        format_no, issue_date, rev_no, rev_date, rows_json, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '5081 3420 0143',
        'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)',
        'R64533',
        'TATA MOTORS  LTD.',
        "`H' / 28.01.2026",
        'RSB-(J)/F/QA/20',
        '09.04.2026',
        '1',
        '09.04.2026',
        JSON.stringify(rows143),
        'system',
      ]
    );
  }
}

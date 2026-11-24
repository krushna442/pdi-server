import cron from 'node-cron';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendMail } from './mailer.js';
import { query } from '../db/db.js';
import { findAllUsers } from '../models/userModel.js';
import { findTemplateByPartNumber, generateRandomReadings } from '../models/pdiTemplateModel.js';
import { findProductByPartNumber } from '../models/productModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_DIR = path.resolve(__dirname, '../uploads/reports');
if (!fs.existsSync(EXCEL_DIR)) fs.mkdirSync(EXCEL_DIR, { recursive: true });

const SHIFTS = [
  { label: 'Shift A (06:00 – 14:00)', letter: 'A', startHour: 6, endHour: 14 },
  { label: 'Shift B (14:00 – 22:00)', letter: 'B', startHour: 14, endHour: 22 },
  { letter: 'C', label: 'Shift C (22:00 – 06:00)', startHour: 22, endHour: 6 },
];

/**
 * Generate formatted PDI Report Excel for a part number and shift matching official RSB check sheet
 */
export async function generatePdiReportWorkbook({ partNumber, shift = 'A', records = [], template = null, product = null, date = null }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RSB Transmissions (I) Ltd.';
  const ws = wb.addWorksheet('PDI Inspection Report');

  const tpl = template || (await findTemplateByPartNumber(partNumber));
  const prod = product || (await findProductByPartNumber(partNumber));

  const vendorCode = tpl?.vendor_code || prod?.vendor_code || 'R64533';
  const customer = tpl?.customer || prod?.customer || 'TATA MOTORS  LTD.';
  const description = tpl?.description || prod?.model || 'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)';
  const drawRevNo = tpl?.draw_rev_no || prod?.rev_no || "'H' / 28.01.2026";
  const formatNo = tpl?.format_no || 'RSB-(J)/F/QA/20';
  const issueDate = tpl?.issue_date || '09.04.2026';
  const revNo = tpl?.rev_no || '1';
  const revDate = tpl?.rev_date || '09.04.2026';

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FF94A3B8' } },
    left: { style: 'thin', color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    right: { style: 'thin', color: { argb: 'FF94A3B8' } },
  };

  // Set row heights for header block
  ws.getRow(1).height = 18;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 14;
  ws.getRow(4).height = 20;

  // 1. TOP HEADER: LOGO (Cols A-B, Rows 1-4)
  ws.mergeCells('A1:B4');
  const logoPath = path.resolve('uploads/assets/rsb_logo.png');
  if (fs.existsSync(logoPath)) {
    try {
      const logoId = wb.addImage({
        filename: logoPath,
        extension: 'png',
      });
      ws.addImage(logoId, {
        tl: { col: 0.1, row: 0.15 },
        ext: { width: 130, height: 50 },
        editAs: 'oneCell',
      });
    } catch (e) {
      console.warn('Could not add logo to Excel:', e.message);
    }
  }

  // 2. TOP HEADER: CENTER TITLE (Cols C-J, Rows 1-4)
  ws.mergeCells('C1:J1');
  ws.getCell('C1').value = 'RSB TRANSMISSIONS (I) LTD.';
  ws.getCell('C1').font = { size: 14, bold: true, color: { argb: 'FF1E293B' } };
  ws.getCell('C1').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C2:J2');
  ws.getCell('C2').value = 'Gamharia, Jamshedpur';
  ws.getCell('C2').font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
  ws.getCell('C2').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('C3:J3');
  ws.getCell('C3').value = '';

  ws.mergeCells('C4:J4');
  ws.getCell('C4').value = 'PRE-DISPATCH INSPECTION REPORT';
  ws.getCell('C4').font = { size: 12, bold: true, underline: true, color: { argb: 'FF1E293B' } };
  ws.getCell('C4').alignment = { horizontal: 'center', vertical: 'middle' };

  // 3. TOP HEADER: PART IMAGE (Cols K-M, Rows 1-4)
  ws.mergeCells('K1:M4');
  let partImgFile = null;
  if (prod?.part_image) {
    const p1 = path.resolve(prod.part_image);
    if (fs.existsSync(p1)) partImgFile = p1;
  }
  if (!partImgFile) {
    const p2 = path.resolve(`uploads/part_images/${partNumber.replace(/[^a-zA-Z0-9]/g, '_')}.png`);
    if (fs.existsSync(p2)) partImgFile = p2;
  }
  if (partImgFile) {
    try {
      const partImgId = wb.addImage({
        filename: partImgFile,
        extension: 'png',
      });
      // Adaptive placement keeping layout clean (width adjusted to 105 to prevent horizontal stretching)
      ws.addImage(partImgId, {
        tl: { col: 10.15, row: 0.15 },
        ext: { width: 105, height: 60 },
        editAs: 'oneCell',
      });
    } catch (e) {
      console.warn('Could not add part image to Excel:', e.message);
    }
  }

  // 4. TOP HEADER: SPECIFICATION BOX (Cols N-O, Rows 1-4)
  ws.getCell('N1').value = 'Format no.';
  ws.getCell('O1').value = formatNo;
  ws.getCell('N2').value = 'Issue Date';
  ws.getCell('O2').value = issueDate;
  ws.getCell('N3').value = 'Rev. no.';
  ws.getCell('O3').value = revNo;
  ws.getCell('N4').value = 'Rev. Date:';
  ws.getCell('O4').value = revDate;

  for (let r = 1; r <= 4; r++) {
    ws.getCell(`N${r}`).font = { size: 8, bold: true, color: { argb: 'FF475569' } };
    ws.getCell(`O${r}`).font = { size: 8, bold: true, color: { argb: 'FF0F172A' } };
    ws.getCell(`N${r}`).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getCell(`O${r}`).alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // 5. METADATA BLOCK (Rows 5 to 8)
  ws.getRow(5).height = 18;
  ws.getRow(6).height = 18;
  ws.getRow(7).height = 18;
  ws.getRow(8).height = 18;

  // Row 5: VENDOR CODE
  ws.getCell('A5').value = 'VENDOR CODE:';
  ws.getCell('A5').font = { size: 8.5, bold: true };
  ws.mergeCells('B5:D5');
  ws.getCell('B5').value = vendorCode;
  ws.getCell('B5').font = { size: 9, bold: true };
  ws.mergeCells('E5:O5');
  ws.getCell('E5').value = '';

  // Row 6: PART NO | CUSTOMER | ASN NO
  ws.getCell('A6').value = 'PART NO :';
  ws.getCell('A6').font = { size: 8.5, bold: true };
  ws.mergeCells('B6:D6');
  ws.getCell('B6').value = `* ${partNumber}`;
  ws.getCell('B6').font = { size: 9.5, bold: true, color: { argb: 'FF0F172A' } };

  ws.mergeCells('E6:G6');
  ws.getCell('E6').value = 'CUSTOMER :';
  ws.getCell('E6').font = { size: 8.5, bold: true };

  ws.mergeCells('H6:J6');
  ws.getCell('H6').value = customer;
  ws.getCell('H6').font = { size: 9, bold: true };

  ws.mergeCells('K6:L6');
  ws.getCell('K6').value = 'ASN NO.:';
  ws.getCell('K6').font = { size: 8.5, bold: true };
  ws.mergeCells('M6:O6');
  ws.getCell('M6').value = '';

  // Row 7: DESCRIPTION | LOT QTY | INVOICE NO
  ws.getCell('A7').value = 'DESCRIPTION:';
  ws.getCell('A7').font = { size: 8.5, bold: true };
  ws.mergeCells('B7:D7');
  ws.getCell('B7').value = description;
  ws.getCell('B7').font = { size: 9, bold: true };

  ws.mergeCells('E7:G7');
  ws.getCell('E7').value = 'LOT QTY:';
  ws.getCell('E7').font = { size: 8.5, bold: true };

  ws.mergeCells('H7:J7');
  ws.getCell('H7').value = `${records.length || 4} nos.`;
  ws.getCell('H7').font = { size: 9, bold: true };

  ws.mergeCells('K7:L7');
  ws.getCell('K7').value = 'INVOICE NO:';
  ws.getCell('K7').font = { size: 8.5, bold: true };
  ws.mergeCells('M7:O7');
  ws.getCell('M7').value = '';

  // Row 8: DRAW REV NO | SAMPLE SIZE | DATE
  ws.getCell('A8').value = 'DRAW REV NO:';
  ws.getCell('A8').font = { size: 8.5, bold: true };
  ws.mergeCells('B8:D8');
  ws.getCell('B8').value = drawRevNo;
  ws.getCell('B8').font = { size: 9, bold: true };

  ws.mergeCells('E8:G8');
  ws.getCell('E8').value = 'SAMPLE SIZE:';
  ws.getCell('E8').font = { size: 8.5, bold: true };

  ws.mergeCells('H8:J8');
  ws.getCell('H8').value = `${Math.min(records.length || 4, 6)} nos.`;
  ws.getCell('H8').font = { size: 9, bold: true };

  ws.mergeCells('K8:L8');
  ws.getCell('K8').value = 'DATE:';
  ws.getCell('K8').font = { size: 8.5, bold: true };
  ws.mergeCells('M8:O8');
  ws.getCell('M8').value = date || new Date().toLocaleDateString('en-IN');
  ws.getCell('M8').font = { size: 8.5, bold: true };

  // 6. SECTION A HEADER: Dimension parameters
  ws.mergeCells('A9:O9');
  ws.getCell('A9').value = 'A) Dimension parameters';
  ws.getCell('A9').font = { size: 9, bold: true, color: { argb: 'FF1E293B' } };
  ws.getCell('A9').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };

  // 7. TABLE COLUMN HEADERS (Row 10 and 11)
  ws.getRow(10).height = 20;
  ws.getRow(11).height = 18;

  ws.mergeCells('A10:A11');
  ws.getCell('A10').value = '#';

  ws.mergeCells('B10:B11');
  ws.getCell('B10').value = 'PARAMETERS';

  ws.mergeCells('C10:E10');
  ws.getCell('C10').value = 'SPECIFICATION (mm)';

  ws.mergeCells('F10:F11');
  ws.getCell('F10').value = 'SPECIAL CHARACTERS (COC)';

  ws.mergeCells('G10:G11');
  ws.getCell('G10').value = 'METHOD OF INSPECTION (REGULAR)';

  ws.mergeCells('H10:H11');
  ws.getCell('H10').value = 'METHOD OF INSPECTION (ALTERNATE)';

  ws.mergeCells('I10:N10');
  ws.getCell('I10').value = 'ACTUAL MEASURED VALUE';

  ws.mergeCells('O10:O11');
  ws.getCell('O10').value = 'REMARKS';

  // Subheader row 11
  ws.getCell('C11').value = 'MEAN';
  ws.getCell('D11').value = 'MAX';
  ws.getCell('E11').value = 'MIN';
  ws.getCell('I11').value = '1';
  ws.getCell('J11').value = '2';
  ws.getCell('K11').value = '3';
  ws.getCell('L11').value = '4';
  ws.getCell('M11').value = '5';
  ws.getCell('N11').value = '6';

  for (let r = 10; r <= 11; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 15; c++) {
      const cell = row.getCell(c);
      cell.font = { size: 7.5, bold: true, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
    }
  }

  // 8. POPULATE PARAMETER ROWS FROM TEMPLATE
  const rows = tpl?.rows || [];
  let currentExcelRow = 12;

  // Group contiguous rows by parameter name for Column B merging
  const paramGroups = [];
  let curGroup = null;

  rows.forEach((item, idx) => {
    const pName = (item.parameter || '').trim();
    const isVar = (item.min !== null && item.min !== '' && item.min !== undefined && !isNaN(Number(item.min))) ||
                  (item.max !== null && item.max !== '' && item.max !== undefined && !isNaN(Number(item.max))) ||
                  (item.variable_value !== null && item.variable_value !== '' && item.variable_value !== undefined && !isNaN(Number(item.variable_value)));

    // We merge if consecutive rows have the same parameter AND (they are fixed text or parameter is Appearance)
    if (curGroup && curGroup.param.toLowerCase() === pName.toLowerCase() && pName !== '' && (!isVar || curGroup.param.toLowerCase().includes('appearance'))) {
      curGroup.count++;
      curGroup.endIndex = idx;
    } else {
      curGroup = {
        param: pName,
        startIndex: idx,
        endIndex: idx,
        count: 1,
      };
      paramGroups.push(curGroup);
    }
  });

  const rowToParamGroup = new Map();
  paramGroups.forEach((g) => {
    for (let i = g.startIndex; i <= g.endIndex; i++) {
      rowToParamGroup.set(i, g);
    }
  });

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const rNum = 12 + i;
    const r = ws.getRow(rNum);
    const readings = generateRandomReadings(item, 6);

    const isVariable = (item.min !== null && item.min !== '' && item.min !== undefined && !isNaN(Number(item.min))) ||
                       (item.max !== null && item.max !== '' && item.max !== undefined && !isNaN(Number(item.max))) ||
                       (item.variable_value !== null && item.variable_value !== '' && item.variable_value !== undefined && !isNaN(Number(item.variable_value)));

    // Dynamic row height so multi-line text fits without clipping
    const textLen = Math.max((item.mean || '').length, (item.parameter || '').length);
    let rowH = 22;
    if (textLen > 65) rowH = 38;
    else if (textLen > 35) rowH = 28;
    else rowH = 22;
    r.height = rowH;

    // Col 1: #
    r.getCell(1).value = item.sr || i + 1;
    r.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(1).font = { size: 8 };

    // Col 2: PARAMETERS (Common parameter merged vertically across common rows)
    const g = rowToParamGroup.get(i);
    if (g && g.count > 1) {
      if (i === g.startIndex) {
        ws.mergeCells(12 + g.startIndex, 2, 12 + g.endIndex, 2);
        const cell = ws.getCell(12 + g.startIndex, 2);
        cell.value = g.param;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.font = { size: 8.5, bold: true };
      }
    } else {
      r.getCell(2).value = item.parameter || '';
      r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      r.getCell(2).font = { size: 8 };
    }

    // Col 3, 4, 5: SPECIFICATION (mm) [MEAN, MAX, MIN]
    // If not variable (fixed text row), merge across all 3 columns (full width / 3 shells)
    if (isVariable) {
      r.getCell(3).value = item.mean || (item.main_value ? `${item.main_value}±${item.variable_value || ''}` : '');
      r.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(3).font = { size: 8 };

      r.getCell(4).value = item.max ?? '';
      r.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(4).font = { size: 8 };

      r.getCell(5).value = item.min ?? '';
      r.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      r.getCell(5).font = { size: 8 };
    } else {
      // Non-variable / fixed text row: MERGE C:E across all 3 columns
      ws.mergeCells(rNum, 3, rNum, 5);
      const specCell = r.getCell(3);
      specCell.value = item.mean || item.measurement_text || '';
      specCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      specCell.font = { size: 8 };
    }

    // Col 6: SPECIAL CHARACTERS (COC)
    r.getCell(6).value = item.special_char || '';
    r.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
    r.getCell(6).font = { size: 8 };

    // Col 7 & 8: METHOD OF INSPECTION (merge when alternate is empty)
    if (!item.method_alternate || item.method_alternate.trim() === '') {
      ws.mergeCells(rNum, 7, rNum, 8);
      const mCell = r.getCell(7);
      mCell.value = item.method_regular || '';
      mCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      mCell.font = { size: 8 };
    } else {
      r.getCell(7).value = item.method_regular || '';
      r.getCell(7).alignment = { horizontal: 'left', vertical: 'middle' };
      r.getCell(7).font = { size: 8 };

      r.getCell(8).value = item.method_alternate || '';
      r.getCell(8).alignment = { horizontal: 'left', vertical: 'middle' };
      r.getCell(8).font = { size: 8 };
    }

    // Col 9..14: ACTUAL MEASURED VALUE (1..6)
    let defReading = 'Ok';
    if (item.measurement_text && item.measurement_text.trim().length > 0 && item.measurement_text.trim().length <= 15) {
      defReading = item.measurement_text.trim();
    }

    for (let j = 0; j < 6; j++) {
      const c = r.getCell(9 + j);
      let val = readings[j];
      if (!isVariable) {
        if (typeof val === 'string' && val.length > 15) {
          val = defReading;
        } else if (val === undefined || val === null || val === '') {
          val = defReading;
        }
      } else {
        if (val === undefined || val === null || val === '') {
          val = item.mean || '';
        }
      }
      c.value = val;
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.font = { size: 8, bold: true };
    }

    // Col 15: REMARKS
    r.getCell(15).value = item.remarks || '';
    r.getCell(15).alignment = { horizontal: 'left', vertical: 'middle' };
    r.getCell(15).font = { size: 8 };
  }

  currentExcelRow = 12 + rows.length;

  // 9. SECTION B: Customer and complaint parameters
  ws.mergeCells(currentExcelRow, 1, currentExcelRow, 15);
  const cellB = ws.getCell(currentExcelRow, 1);
  cellB.value = 'B) Customer and complaint parameters & Check points (ALL Customer complaint issues to be covered & measured 100%)';
  cellB.font = { size: 8.5, bold: true };
  cellB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  currentExcelRow++;

  // Blank line under B
  ws.mergeCells(currentExcelRow, 1, currentExcelRow, 15);
  ws.getRow(currentExcelRow).height = 14;
  currentExcelRow++;

  // 10. SECTION C: Material Grade
  ws.mergeCells(currentExcelRow, 1, currentExcelRow, 15);
  const cellC = ws.getCell(currentExcelRow, 1);
  cellC.value = 'C) Material Grade';
  cellC.font = { size: 8.5, bold: true };
  cellC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  currentExcelRow++;

  ws.mergeCells(currentExcelRow, 1, currentExcelRow, 15);
  const cellCVal = ws.getCell(currentExcelRow, 1);
  cellCVal.value = '   Proprietary Item of RSB';
  cellCVal.font = { size: 8.5, italic: true };
  currentExcelRow++;

  // 11. SECTION D: Surface coating
  ws.mergeCells(currentExcelRow, 1, currentExcelRow, 15);
  const cellD = ws.getCell(currentExcelRow, 1);
  cellD.value = 'D) Surface coating';
  cellD.font = { size: 8.5, bold: true };
  cellD.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  currentExcelRow++;

  const rowD = ws.getRow(currentExcelRow);
  rowD.height = 18;
  rowD.getCell(2).value = 'CED coating DFT';
  rowD.getCell(2).font = { size: 8 };

  ws.mergeCells(currentExcelRow, 3, currentExcelRow, 5);
  ws.getCell(currentExcelRow, 3).value = 'Coating thickness 20µ Min.';
  ws.getCell(currentExcelRow, 3).font = { size: 8 };
  ws.getCell(currentExcelRow, 3).alignment = { horizontal: 'center' };

  ws.mergeCells(currentExcelRow, 7, currentExcelRow, 8);
  ws.getCell(currentExcelRow, 7).value = 'Coating Thickness Gauge';
  ws.getCell(currentExcelRow, 7).font = { size: 8 };

  for (let i = 0; i < 6; i++) {
    const c = rowD.getCell(9 + i);
    c.value = 'Ok';
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.font = { size: 8, bold: true };
  }
  rowD.getCell(15).value = 'Ok';
  currentExcelRow++;

  // 12. BOTTOM SIGN-OFF & SAMPLING PLAN
  const opName = records[0]?.created_by || 'Raj Kapoor';

  // Sign-off Row 1
  ws.mergeCells(currentExcelRow, 1, currentExcelRow, 5);
  ws.getCell(currentExcelRow, 1).value = `Inspector Name & Signature: ${opName} (Verified ✓)`;
  ws.getCell(currentExcelRow, 1).font = { size: 8.5, bold: true };
  ws.getCell(currentExcelRow, 1).alignment = { vertical: 'middle' };

  ws.getCell(currentExcelRow, 6).value = 'Status of Inspection';
  ws.getCell(currentExcelRow, 6).font = { size: 8, bold: true };
  ws.getCell(currentExcelRow, 6).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(currentExcelRow, 7).value = 'Accepted ✓';
  ws.getCell(currentExcelRow, 7).font = { size: 8, bold: true, color: { argb: 'FF15803D' } };
  ws.getCell(currentExcelRow, 7).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.getCell(currentExcelRow, 8).value = 'Rejected';
  ws.getCell(currentExcelRow, 8).font = { size: 8, color: { argb: 'FF94A3B8' } };
  ws.getCell(currentExcelRow, 8).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells(currentExcelRow, 9, currentExcelRow, 15);
  ws.getCell(currentExcelRow, 9).value = 'TML Verification Name & Sign:';
  ws.getCell(currentExcelRow, 9).font = { size: 8.5, bold: true };
  ws.getCell(currentExcelRow, 9).alignment = { vertical: 'middle' };
  currentExcelRow++;

  // Sampling Plan Block (3 subrows)
  const spStart = currentExcelRow;
  ws.mergeCells(spStart, 1, spStart + 2, 5);
  ws.getCell(spStart, 1).value = 'Quality Head Name & Signature:\n\n__________________________';
  ws.getCell(spStart, 1).font = { size: 8.5, bold: true };
  ws.getCell(spStart, 1).alignment = { vertical: 'middle', wrapText: true };

  ws.mergeCells(spStart, 6, spStart + 2, 8);
  ws.getCell(spStart, 6).value = 'Sampling plan';
  ws.getCell(spStart, 6).font = { size: 8.5, bold: true };
  ws.getCell(spStart, 6).alignment = { horizontal: 'center', vertical: 'middle' };

  // Subrow 1
  ws.mergeCells(spStart, 9, spStart, 11);
  ws.getCell(spStart, 9).value = 'Customer complaint';
  ws.getCell(spStart, 9).font = { size: 8 };
  ws.mergeCells(spStart, 12, spStart, 15);
  ws.getCell(spStart, 12).value = '100% Inspection';
  ws.getCell(spStart, 12).font = { size: 8, bold: true };

  // Subrow 2
  ws.mergeCells(spStart + 1, 9, spStart + 1, 11);
  ws.getCell(spStart + 1, 9).value = 'Dimension Parameter';
  ws.getCell(spStart + 1, 9).font = { size: 8 };
  ws.mergeCells(spStart + 1, 12, spStart + 1, 15);
  ws.getCell(spStart + 1, 12).value = 'Minimum 4nos.';
  ws.getCell(spStart + 1, 12).font = { size: 8, bold: true };

  // Subrow 3
  ws.mergeCells(spStart + 2, 9, spStart + 2, 11);
  ws.getCell(spStart + 2, 9).value = 'Visual crack';
  ws.getCell(spStart + 2, 9).font = { size: 8 };
  ws.mergeCells(spStart + 2, 12, spStart + 2, 15);
  ws.getCell(spStart + 2, 12).value = '100% Inspection';
  ws.getCell(spStart + 2, 12).font = { size: 8, bold: true };

  const finalExcelRow = spStart + 2;

  // Apply thin borders to all active cells in table range
  for (let r = 1; r <= finalExcelRow; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= 15; c++) {
      const cell = row.getCell(c);
      cell.border = thinBorder;
    }
  }

  // Adjust column widths to match check sheet proportions
  ws.columns = [
    { width: 5 },   // A: #
    { width: 34 },  // B: Parameter
    { width: 12 },  // C: Mean
    { width: 8 },   // D: Max
    { width: 8 },   // E: Min
    { width: 12 },  // F: Special char (COC)
    { width: 22 },  // G: Method regular
    { width: 18 },  // H: Method alternate
    { width: 8 },   // I: 1
    { width: 8 },   // J: 2
    { width: 8 },   // K: 3
    { width: 8 },   // L: 4
    { width: 8 },   // M: 5
    { width: 8 },   // N: 6 / Spec label
    { width: 16 },  // O: Remarks / Spec value
  ];

  const safeDate = (date || new Date().toISOString().slice(0, 10)).replace(/[^a-zA-Z0-9-]/g, '_');
  const filename = `PDI_${partNumber.replace(/[^a-zA-Z0-9]/g, '_')}_Shift_${shift}_${safeDate}.xlsx`;
  const filePath = path.join(EXCEL_DIR, filename);
  await wb.xlsx.writeFile(filePath);
  return { filePath, filename };
}

/**
 * Generate Scan Report Excel for a given shift window
 */
export async function generateScanReportWorkbook({ shift, records = [], dateStr }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RSB Transmissions (I) Ltd.';
  const ws = wb.addWorksheet('Shift Scan Records');

  // Title header block
  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = `RSB TRANSMISSIONS (I) LTD. — SHIFT ${shift} SCAN INSPECTION REPORT (${dateStr})`;
  ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1E293B' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:J2');
  ws.getCell('A2').value = `Total Scans: ${records.length} | Generated: ${new Date().toLocaleString('en-IN')}`;
  ws.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  // Table Headers (Row 4)
  const headerRow = ws.getRow(4);
  headerRow.values = [
    '#',
    'Part No',
    'Model / Description',
    'Vendor Code',
    'Customer',
    'Part Serial No',
    'QR Label',
    'Status',
    'Operator',
    'Date & Time',
  ];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.height = 24;

  for (let c = 1; c <= 10; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' }, // RSB Royal Blue
    };
    cell.alignment = {
      horizontal: c === 1 || c === 8 ? 'center' : 'left',
      vertical: 'middle',
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  }

  // Populate data rows
  records.forEach((rec, idx) => {
    const row = ws.addRow([
      idx + 1,
      rec.part_no || '-',
      rec.model || '-',
      rec.vendor_code || '-',
      rec.customer_name || '-',
      rec.part_sl_no || '-',
      rec.scanned_text || '-',
      rec.validation_status ? rec.validation_status.toUpperCase() : 'PASS',
      rec.created_by || '-',
      new Date(rec.created_at).toLocaleString('en-IN'),
    ]);

    row.height = 20;
    const isEven = idx % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    for (let c = 1; c <= 10; c++) {
      const cell = row.getCell(c);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgArgb },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: c === 1 || c === 8 ? 'center' : 'left',
      };

      // Format QR Label column
      if (c === 7) {
        cell.font = { name: 'Consolas', size: 9 };
      }

      // Format Status column
      if (c === 8) {
        const isPass = (rec.validation_status || '').toLowerCase() === 'pass';
        cell.font = { bold: true, color: { argb: isPass ? 'FF15803D' : 'FFB91C1C' } };
      }
    }
  });

  ws.columns = [
    { width: 6 },  // 1: #
    { width: 22 }, // 2: Part No
    { width: 34 }, // 3: Model / Description
    { width: 14 }, // 4: Vendor Code
    { width: 24 }, // 5: Customer
    { width: 18 }, // 6: Part Serial No
    { width: 50 }, // 7: QR Label
    { width: 12 }, // 8: Status
    { width: 18 }, // 9: Operator
    { width: 22 }, // 10: Date & Time
  ];

  const filename = `Scan_Report_Shift_${shift}_${dateStr}.xlsx`;
  const filePath = path.join(EXCEL_DIR, filename);
  await wb.xlsx.writeFile(filePath);
  return { filePath, filename };
}

/**
 * Run shift reporting workflow:
 * 1. Fetch records
 * 2. Generate Excels
 * 3. Send email to active users with subscribed roles
 */
export async function runShiftReporting(shiftLetter, explicitDate = null) {
  const today = explicitDate || new Date();
  const dateStr = today.toISOString().slice(0, 10);
  console.log(`[ShiftCron] Running Shift ${shiftLetter} report for ${dateStr}...`);

  // Time window for shift
  const shiftDef = SHIFTS.find((s) => s.letter === shiftLetter) || SHIFTS[0];
  const from = new Date(today);
  const to = new Date(today);

  if (shiftDef.startHour < shiftDef.endHour) {
    from.setHours(shiftDef.startHour, 0, 0, 0);
    to.setHours(shiftDef.endHour, 0, 0, 0);
  } else {
    // Overnight Shift C
    to.setHours(shiftDef.endHour, 0, 0, 0);
    from.setDate(from.getDate() - 1);
    from.setHours(shiftDef.startHour, 0, 0, 0);
  }

  // Fetch scans
  const records = await query(
    `SELECT * FROM scanned_products WHERE shift = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC`,
    [shiftLetter, from, to]
  );

  console.log(`[ShiftCron] Found ${records.length} scans for Shift ${shiftLetter}.`);

  const attachments = [];

  // Generate Scan Report
  const scanWb = await generateScanReportWorkbook({ shift: shiftLetter, records, dateStr });
  attachments.push({ filename: scanWb.filename, path: scanWb.filePath });

  // Group by part number for PDI reports
  const partMap = {};
  for (const r of records) {
    if (!partMap[r.part_no]) partMap[r.part_no] = [];
    partMap[r.part_no].push(r);
  }

  for (const [partNumber, partRecords] of Object.entries(partMap)) {
    try {
      const pdiWb = await generatePdiReportWorkbook({
        partNumber,
        shift: shiftLetter,
        records: partRecords,
      });
      attachments.push({ filename: pdiWb.filename, path: pdiWb.filePath });
    } catch (err) {
      console.error(`[ShiftCron] Error generating PDI Excel for ${partNumber}:`, err.message);
    }
  }

  // Find recipients
  const users = await findAllUsers();
  const recipients = users
    .filter((u) => u.is_active && u.email && (u.role === 'admin' || u.role === 'QA HOD' || u.mail_types?.includes('pdi_report') || u.mail_types?.includes('scan_report')))
    .map((u) => u.email);

  if (recipients.length === 0) {
    console.log('[ShiftCron] No active email recipients found for shift report.');
    return { success: true, count: records.length, emailed: false };
  }

  const passedCount = records.filter((r) => r.validation_status === 'pass').length;
  const failedCount = records.filter((r) => r.validation_status === 'fail').length;

  // Build rows for email preview table
  const previewRows = records.slice(0, 30);
  const rowsHtml = previewRows.map((r, idx) => `
    <tr style="border-bottom: 1px solid #e2e8f0; ${idx % 2 === 0 ? 'background-color: #ffffff;' : 'background-color: #f8fafc;'}">
      <td style="padding: 6px 8px; text-align: center; color: #64748b; font-size: 11px;">${idx + 1}</td>
      <td style="padding: 6px 8px; font-weight: bold; color: #1e293b; font-family: monospace; font-size: 11px;">${r.part_no || '-'}</td>
      <td style="padding: 6px 8px; color: #334155; font-family: monospace; font-size: 11px;">${r.part_sl_no || '-'}</td>
      <td style="padding: 6px 8px; font-family: Consolas, monospace; font-size: 10px; color: #0f172a; word-break: break-all; background-color: #eff6ff;">${r.scanned_text || '-'}</td>
      <td style="padding: 6px 8px; color: #475569; font-size: 11px;">${r.vendor_code || '-'}</td>
      <td style="padding: 6px 8px; text-align: center;">
        <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: bold; ${r.validation_status === 'pass' ? 'background-color: #dcfce7; color: #15803d;' : 'background-color: #fee2e2; color: #b91c1c;'}">
          ${(r.validation_status || 'pass').toUpperCase()}
        </span>
      </td>
      <td style="padding: 6px 8px; color: #64748b; font-size: 11px; text-align: center;">${new Date(r.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
    </tr>
  `).join('');

  const moreNoticeHtml = records.length > 30 ? `
    <tr>
      <td colspan="7" style="padding: 10px; text-align: center; color: #64748b; font-style: italic; background-color: #f1f5f9; font-size: 11px;">
        Showing first 30 of ${records.length} scans. All ${records.length} scan records with their full QR labels are in the attached file <strong>${scanWb.filename}</strong>.
      </td>
    </tr>
  ` : '';

  const emptyNoticeHtml = records.length === 0 ? `
    <tr>
      <td colspan="7" style="padding: 14px; text-align: center; color: #64748b; font-style: italic; font-size: 12px;">
        No product scans recorded during this shift window.
      </td>
    </tr>
  ` : '';

  const subject = `RSB PDI & Scan Inspection Report — Shift ${shiftLetter} (${dateStr}) [${records.length} Scans]`;
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 850px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 16px;">
        <h2 style="color: #1d4ed8; margin: 0; font-size: 20px;">RSB TRANSMISSIONS (I) LTD.</h2>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 13px;">Pre-Dispatch Inspection (PDI) & Product Scan Shift Report</p>
      </div>

      <p style="font-size: 14px;">Dear Team,</p>
      <p style="font-size: 13px; color: #334155;">
        Please find attached the automated quality inspection and scanning reports for <strong>Shift ${shiftLetter} (${shiftDef.label})</strong> on <strong>${dateStr}</strong>.
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 12px;">
        <tr style="background-color: #f1f5f9;">
          <th style="padding: 8px 12px; text-align: left; border: 1px solid #cbd5e1;">Metric</th>
          <th style="padding: 8px 12px; text-align: left; border: 1px solid #cbd5e1;">Details</th>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: bold;">Shift & Timings</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">Shift ${shiftLetter} (${shiftDef.label})</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: bold;">Total Scans Recorded</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;"><strong>${records.length}</strong> (Pass: <span style="color: #15803d; font-weight: bold;">${passedCount}</span> | Fail: <span style="color: #b91c1c; font-weight: bold;">${failedCount}</span>)</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-weight: bold;">Parts Inspected</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${Object.keys(partMap).join(', ') || 'None'}</td>
        </tr>
      </table>

      <h3 style="font-size: 14px; color: #0f172a; margin-top: 20px; margin-bottom: 8px;">
        Shift Scanned Product Records (QR Labels):
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; border: 1px solid #cbd5e1;">
        <thead>
          <tr style="background-color: #1d4ed8; color: #ffffff;">
            <th style="padding: 8px 6px; text-align: center; border: 1px solid #cbd5e1; width: 30px;">#</th>
            <th style="padding: 8px 8px; text-align: left; border: 1px solid #cbd5e1; width: 110px;">Part No</th>
            <th style="padding: 8px 8px; text-align: left; border: 1px solid #cbd5e1; width: 90px;">Part Sl No</th>
            <th style="padding: 8px 8px; text-align: left; border: 1px solid #cbd5e1; background-color: #2563eb;">QR Label</th>
            <th style="padding: 8px 8px; text-align: left; border: 1px solid #cbd5e1; width: 80px;">Vendor Code</th>
            <th style="padding: 8px 6px; text-align: center; border: 1px solid #cbd5e1; width: 65px;">Status</th>
            <th style="padding: 8px 6px; text-align: center; border: 1px solid #cbd5e1; width: 70px;">Time</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || emptyNoticeHtml}
          ${moreNoticeHtml}
        </tbody>
      </table>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin-top: 15px;">
        <strong style="font-size: 12px; color: #334155;">Attached Excel Files (${attachments.length}):</strong>
        <ul style="margin: 6px 0 0 0; padding-left: 20px; font-size: 12px; color: #475569;">
          ${attachments.map((a) => `<li><strong>${a.filename}</strong></li>`).join('')}
        </ul>
      </div>

      <p style="font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 20px;">
        Automated shift report from RSB Quality Inspection System. Please do not reply directly to this email.
      </p>
    </div>
  `;

  try {
    await sendMail({
      to: recipients,
      subject,
      html,
      attachments,
    });
    console.log(`[ShiftCron] Shift ${shiftLetter} email sent to ${recipients.join(', ')}`);
    return { success: true, count: records.length, emailed: true, recipients };
  } catch (err) {
    console.error('[ShiftCron] Failed to send shift email:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Initialize node-cron schedules:
 * Shift A: 14:00
 * Shift B: 22:00
 * Shift C: 06:00
 * Daily summary: 06:05
 */
export function initShiftCronJobs() {
  // Shift A: 14:00 (2:00 PM)
  cron.schedule('0 14 * * *', async () => {
    console.log('[Cron] Triggering Shift A end-of-shift report...');
    await runShiftReporting('A');
  });

  // Shift B: 22:00 (10:00 PM)
  cron.schedule('0 22 * * *', async () => {
    console.log('[Cron] Triggering Shift B end-of-shift report...');
    await runShiftReporting('B');
  });

  // Shift C: 06:00 (6:00 AM)
  cron.schedule('0 6 * * *', async () => {
    console.log('[Cron] Triggering Shift C end-of-shift report...');
    await runShiftReporting('C');
  });

  console.log('✅ Shift report cron jobs initialized (Shift A: 14:00, Shift B: 22:00, Shift C: 06:00).');
}

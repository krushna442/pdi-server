/**
 * parseScanText.js
 * Parses scanned barcode/QR text into structured fields.
 * Primarily supports:
 *  F2 – "$"-delimited
 *       "7205761$FEA73900$002246$07.04.2026$NA$NA$REV$..."
 *        [0]=VENDOR [1]=PART_NO [2]=SL [3]=DATE [4..5]=NA [6..7]=REV
 *
 *  F3 – Fixed-width numeric block (starts with "00")
 *       00 + PART_NO(12) + REV(2) + VENDOR(6|7|8) + MM(2) + YY(2) + SL(6)
 *       Leading "00" is stripped from the 14-char block to get the 12-digit part number.
 *
 *  Also provides fallback support for other standard formats if needed.
 */

function normaliseRev(raw = '') {
  let s = String(raw).replace(/rev\s*no\s*/i, '').trim();
  if (!s.startsWith('#') && !s.startsWith("'") && s !== '') {
    s = '#' + s;
  }
  return s.toUpperCase().replace(/\s+/g, '');
}

function buildDate(year, month, day) {
  try {
    const y = String(year).padStart(4, '20');
    const m = String(month).padStart(2, '0');
    const d = day ? String(day).padStart(2, '0') : '01';
    if (isNaN(new Date(`${y}-${m}-${d}`).getTime())) return null;
    return `${y}-${m}-${d}`;
  } catch {
    return null;
  }
}

/** F2: contains '$' delimiter */
function isF2(text) {
  return text.includes('$');
}

/** F3: Starts with '00', alphanumeric, length >= 30 */
function isF3(text) {
  const t = text.trim();
  return t.startsWith('00') && /^[A-Z0-9]+$/i.test(t) && t.length >= 30;
}

/** F2 parser */
function parseF2(text) {
  const parts = text.split('$').map(s => s.trim());
  if (parts.length < 3) return null;

  const vendor = parts[0] || '';
  const partNo = parts[1] || '';
  const sl = parts[2] || '';
  const dateRaw = parts[3] || '';

  let revRaw = parts[7] || parts[6] || '';
  if (!revRaw && parts.length > 4) {
    const revToken = parts.find((p, idx) => idx >= 4 && (p.toLowerCase().includes('rev') || p.startsWith('#')));
    if (revToken) revRaw = revToken;
  }

  let dispatchDate = null;
  if (dateRaw && dateRaw.toUpperCase() !== 'NA') {
    const match = dateRaw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
    if (match) {
      dispatchDate = buildDate(match[3], match[2], match[1]);
    }
  }

  return {
    format: 'F2',
    partNo: partNo.trim(),
    revNo: revRaw ? normaliseRev(revRaw) : '',
    vendorCode: vendor.trim(),
    partSlNo: sl.trim(),
    dispatchDate,
  };
}

/** F3 parser */
function parseF3(text) {
  const t = text.trim();
  const layouts = [
    { partLen: 14, vendorLen: 6 }, // 14 + 2 + 6 + 2 + 2 + 6 = 32
    { partLen: 14, vendorLen: 7 }, // 33
    { partLen: 14, vendorLen: 8 }, // 34
    { partLen: 12, vendorLen: 6 }, // alternate
    { partLen: 12, vendorLen: 7 },
  ];

  for (const { partLen, vendorLen } of layouts) {
    const total = partLen + 2 + vendorLen + 2 + 2 + 6;
    if (t.length !== total && t.length !== total - 2) continue;

    let offset = 0;
    const partNo = t.slice(offset, offset + partLen).replace(/^00/, '').trim();
    offset += partLen;

    const revRaw = t.slice(offset, offset + 2);
    offset += 2;

    const vendor = t.slice(offset, offset + vendorLen).trim();
    offset += vendorLen;

    const month = t.slice(offset, offset + 2);
    offset += 2;

    const year = '20' + t.slice(offset, offset + 2);
    offset += 2;

    const sl = t.slice(offset, offset + 6).trim();

    return {
      format: 'F3',
      partNo,
      revNo: normaliseRev(revRaw),
      vendorCode: vendor,
      partSlNo: sl,
      dispatchDate: buildDate(year, month, null),
    };
  }

  // Fallback for F3 with varying lengths
  if (t.startsWith('00') && t.length >= 26) {
    const partNo = t.slice(0, 14).replace(/^00/, '').trim();
    const sl = t.slice(-6).trim();
    const vendor = t.slice(16, -10).trim();
    return {
      format: 'F3',
      partNo,
      revNo: normaliseRev(t.slice(14, 16)),
      vendorCode: vendor,
      partSlNo: sl,
      dispatchDate: null,
    };
  }

  return null;
}

/** Fallback parser for standard Delimited / Raw Scan Text */
function parseGeneric(text) {
  const t = text.trim();
  // Check if comma or space separated
  if (t.includes(',')) {
    const parts = t.split(',').map(s => s.trim());
    return {
      format: 'Generic',
      partNo: parts[0] || '',
      revNo: parts[1] || '',
      vendorCode: parts[2] || '',
      partSlNo: parts[3] || '',
      dispatchDate: null,
    };
  }
  return {
    format: 'Raw',
    partNo: t.split(' ')[0] || t,
    revNo: '',
    vendorCode: '',
    partSlNo: t.length >= 6 ? t.slice(-6) : t,
    dispatchDate: null,
  };
}

export function parseScanText(scannedText) {
  if (!scannedText) return null;
  const text = String(scannedText).trim();

  if (isF2(text)) return parseF2(text);
  if (isF3(text)) return parseF3(text);

  return parseGeneric(text);
}

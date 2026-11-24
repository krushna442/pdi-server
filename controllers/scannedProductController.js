import {
  recordScan,
  findScans,
  findCurrentShiftScans,
  getDashboardStats,
} from '../models/scannedProductModel.js';
import { parseScanText } from '../models/parseScanText.js';
import { findProductByPartNumber } from '../models/productModel.js';

export async function createScan(req, res) {
  try {
    const {
      scanned_text,
      user_part_no,
      user_vendor_code,
      user_model,
      user_rev_no,
      user_customer,
      remarks,
      plant_location,
      part_sl_no,
    } = req.body;

    if (!scanned_text && !user_part_no) {
      return res.status(400).json({ success: false, message: 'Scanned barcode text or Part Number is required' });
    }

    // 1. Parse QR label via parseScanText (F2 or F3)
    const parsed = scanned_text ? parseScanText(scanned_text) : null;

    const extractedPartNo = parsed?.partNo || user_part_no || '';
    const extractedVendorCode = parsed?.vendorCode || user_vendor_code || '';
    const extractedRevNo = parsed?.revNo || user_rev_no || '';
    const extractedSlNo = (part_sl_no && String(part_sl_no).trim()) ? String(part_sl_no).trim() : (parsed?.partSlNo || '');
    const format = parsed?.format || 'Manual';

    // 2. Fetch matched product from Product Master
    const matchedProduct = await findProductByPartNumber(extractedPartNo);

    // 3. Verification checks:
    // Check fields: part no., vendor code, model, rev no., customer
    let status = 'pass';
    const mismatches = [];
    const mismatched_fields = [];

    if (!matchedProduct) {
      status = 'fail';
      mismatches.push(`Part Number '${extractedPartNo}' not registered in Product Master`);
      mismatched_fields.push('part_no');
    } else {
      // Validate Part No if user manually selected one that differs from label
      if (user_part_no && extractedPartNo && user_part_no.trim() !== extractedPartNo.trim()) {
        status = 'fail';
        mismatches.push(`Part No mismatch: selected [${user_part_no}] vs label [${extractedPartNo}]`);
        mismatched_fields.push('part_no');
      }

      // Validate Customer
      if (user_customer && matchedProduct.customer) {
        const uCust = user_customer.trim().toUpperCase();
        const mCust = matchedProduct.customer.trim().toUpperCase();
        const isTataCustomer = uCust.includes('TATA') && mCust.includes('TATA');
        if (uCust !== mCust && !isTataCustomer) {
          status = 'fail';
          mismatches.push(`Customer mismatch: selected [${user_customer}] vs master [${matchedProduct.customer}]`);
          mismatched_fields.push('customer');
        }
      }

      // Validate Model if user selected
      if (user_model && matchedProduct.model && user_model.trim().toUpperCase() !== matchedProduct.model.trim().toUpperCase()) {
        status = 'fail';
        mismatches.push(`Model mismatch: selected [${user_model}] vs master [${matchedProduct.model}]`);
        mismatched_fields.push('model');
      }

      // Validate Vendor Code: Customer and Vendor Code are unified (TATA MOTORS LTD. <=> R64533)
      const isTataEntity = (user_customer && user_customer.toUpperCase().includes('TATA')) ||
                           (matchedProduct.customer && matchedProduct.customer.toUpperCase().includes('TATA'));
      const testVendor = extractedVendorCode || user_vendor_code || (isTataEntity ? 'R64533' : '');
      if (testVendor && matchedProduct.vendor_code) {
        const cleanTest = testVendor.trim().toUpperCase();
        const cleanMaster = matchedProduct.vendor_code.trim().toUpperCase();
        const isTataVendorMatch = isTataEntity && (cleanTest === 'R64533' || cleanMaster === 'R64533');

        if (cleanTest !== cleanMaster && !isTataVendorMatch) {
          status = 'fail';
          mismatches.push(`Vendor Code mismatch: [${testVendor}] vs master [${matchedProduct.vendor_code}]`);
          mismatched_fields.push('vendor_code');
        }
      }

      // Validate Rev No (from label or selection vs master)
      const testRev = extractedRevNo || user_rev_no;
      if (testRev && matchedProduct.rev_no) {
        const cleanExtracted = testRev.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const cleanMaster = matchedProduct.rev_no.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        if (cleanExtracted && cleanMaster && !cleanMaster.includes(cleanExtracted) && !cleanExtracted.includes(cleanMaster)) {
          status = 'fail';
          mismatches.push(`Revision No mismatch: [${testRev}] vs master [${matchedProduct.rev_no}]`);
          mismatched_fields.push('rev_no');
        }
      }
    }

    const recorded = await recordScan({
      part_no: extractedPartNo,
      vendor_code: extractedVendorCode || matchedProduct?.vendor_code || user_vendor_code || '',
      model: user_model || matchedProduct?.model || '',
      rev_no: extractedRevNo || matchedProduct?.rev_no || user_rev_no || '',
      customer_name: user_customer || matchedProduct?.customer || '',
      part_sl_no: extractedSlNo,
      scanned_text: scanned_text || extractedPartNo,
      format,
      validation_status: status,
      is_rejected: status === 'fail' ? 1 : 0,
      remarks: remarks || (mismatches.length > 0 ? mismatches.join('; ') : 'OK'),
      plant_location: plant_location || 'RSB JSR U - IV',
      created_by: req.user?.name || req.user?.username || 'Inspector',
    });

    return res.status(201).json({
      success: true,
      data: recorded,
      validation_status: status,
      mismatches,
      mismatched_fields,
      matchedProduct,
      parsed,
      message: status === 'pass' ? 'Product verified and scanned successfully' : 'Scan Failed: Mismatch found in scanned product',
    });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function parseLabel(req, res) {
  try {
    const { scanned_text } = req.body;
    if (!scanned_text) {
      return res.status(400).json({ success: false, message: 'scanned_text is required' });
    }

    const parsed = parseScanText(scanned_text);
    let matchedProduct = null;
    if (parsed?.partNo) {
      matchedProduct = await findProductByPartNumber(parsed.partNo);
    }

    return res.json({
      success: true,
      parsed,
      matchedProduct,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getScansList(req, res) {
  try {
    const { part_no, shift, status, customer, fromDate, toDate, search, page, limit } = req.query;
    const result = await findScans({
      part_no,
      shift,
      status,
      customer,
      fromDate,
      toDate,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getCurrentShift(req, res) {
  try {
    const records = await findCurrentShiftScans();
    return res.json({ success: true, data: records });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getDashboard(req, res) {
  try {
    const { production_date } = req.query;
    const stats = await getDashboardStats(production_date);
    return res.json({ success: true, data: stats });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

import {
  findAllProducts,
  findProductById,
  findProductByPartNumber,
  createProduct,
  updateProduct,
  deleteProduct,
  getAllProductFields,
  addProductField,
  deleteProductField,
  getDropdownOptions,
} from '../models/productModel.js';
import * as XLSX from 'xlsx';

// ─── FIELDS CONTROLLER ───────────────────────────────────────────────────────

export async function getFields(req, res) {
  try {
    const fields = await getAllProductFields();
    return res.json({ success: true, data: fields });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function addField(req, res) {
  try {
    const { label, type } = req.body;
    if (!label) return res.status(400).json({ success: false, message: 'Field label is required' });

    const newField = await addProductField({ label, type });
    return res.status(201).json({ success: true, data: newField, message: 'Field added successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function removeField(req, res) {
  try {
    const { key } = req.params;
    await deleteProductField(key);
    return res.json({ success: true, message: 'Field deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getProductOptions(req, res) {
  try {
    const data = await getDropdownOptions();
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── PRODUCTS CRUD ───────────────────────────────────────────────────────────

export async function getProducts(req, res) {
  try {
    const { search, customer, status } = req.query;
    const products = await findAllProducts({ search, customer, status });
    return res.json({ success: true, data: products });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getProduct(req, res) {
  try {
    const product = await findProductById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getProductByPart(req, res) {
  try {
    const product = await findProductByPartNumber(req.params.partNumber);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    return res.json({ success: true, data: product });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function uploadPartImage(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file uploaded' });
    }
    const relativePath = `uploads/part_images/${req.file.filename}`;
    return res.json({
      success: true,
      imageUrl: `/${relativePath}`,
      filePath: relativePath,
      message: 'Part image uploaded successfully',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function addProduct(req, res) {
  try {
    const { part_number, vendor_code, model, rev_no, customer, custom_fields, part_image } = req.body;
    if (!part_number || !vendor_code || !model || !rev_no || !customer) {
      return res.status(400).json({
        success: false,
        message: 'Standard fields are required: Part No, Vendor Code, Model, Rev No, Customer',
      });
    }

    const existing = await findProductByPartNumber(part_number);
    if (existing) {
      return res.status(400).json({ success: false, message: `Part Number ${part_number} already exists` });
    }

    const newProd = await createProduct({
      part_number,
      vendor_code,
      model,
      rev_no,
      customer,
      custom_fields,
      part_image: part_image || null,
      created_by: req.user?.username || 'admin',
    });

    return res.status(201).json({ success: true, data: newProd, message: 'Product added successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function editProduct(req, res) {
  try {
    const { id } = req.params;
    const { part_number, vendor_code, model, rev_no, customer, custom_fields, part_image, status } = req.body;

    const updated = await updateProduct(id, {
      part_number,
      vendor_code,
      model,
      rev_no,
      customer,
      custom_fields,
      part_image: part_image !== undefined ? part_image : undefined,
      status,
      modified_by: req.user?.username || 'admin',
    });

    return res.json({ success: true, data: updated, message: 'Product updated successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function removeProduct(req, res) {
  try {
    await deleteProduct(req.params.id);
    return res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

// ─── EXCEL TEMPLATE & IMPORT ─────────────────────────────────────────────────

export async function downloadImportTemplate(req, res) {
  try {
    const fields = await getAllProductFields();

    // Build headers from fields
    const headerRow = {};
    const sampleRow = {};

    fields.forEach((f) => {
      headerRow[f.label] = f.label;
      if (f.field_key === 'part_number') sampleRow[f.label] = '5081 3420 0150';
      else if (f.field_key === 'vendor_code') sampleRow[f.label] = 'R64533';
      else if (f.field_key === 'model') sampleRow[f.label] = 'FIFTH WHEEL ASSY (28 Ton)';
      else if (f.field_key === 'rev_no') sampleRow[f.label] = "A' / 01.01.2026";
      else if (f.field_key === 'customer') sampleRow[f.label] = 'TATA MOTORS  LTD.';
      else sampleRow[f.label] = 'Sample Value';
    });

    const ws = XLSX.utils.json_to_sheet([sampleRow], {
      header: fields.map((f) => f.label),
    });

    // Set column widths
    ws['!cols'] = fields.map(() => ({ wch: 25 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Product Template');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename="Product_Master_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (err) {
    console.error('Template download error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function importProducts(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel file' });
    }

    const fields = await getAllProductFields();
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      // Find standard field keys dynamically by matching label or key
      const getVal = (field) => {
        const direct = row[field.label] !== undefined ? row[field.label] : row[field.field_key];
        if (direct !== undefined && String(direct).trim() !== '') return String(direct).trim();
        // Fallback case-insensitive search
        for (const k of Object.keys(row)) {
          if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === field.label.toLowerCase().replace(/[^a-z0-9]/g, '')) {
            return String(row[k]).trim();
          }
        }
        return '';
      };

      const partNo = getVal({ label: 'Part No.', field_key: 'part_number' }) || row['Part Number'] || row['PART NO.'];
      const vendorCode = getVal({ label: 'Vendor Code', field_key: 'vendor_code' }) || 'R64533';
      const model = getVal({ label: 'Model (Description)', field_key: 'model' }) || row['Model'] || row['Description'];
      const revNo = getVal({ label: 'Rev No.', field_key: 'rev_no' }) || row['Rev No'] || row['Drawing Rev No'];
      const customer = getVal({ label: 'Customer', field_key: 'customer' }) || 'TATA MOTORS  LTD.';

      if (!partNo || !model) {
        skipped++;
        continue;
      }

      // Collect custom fields
      const custom_fields = {};
      const customFieldDefs = fields.filter((f) => !f.is_system);
      for (const cf of customFieldDefs) {
        const val = getVal(cf);
        if (val) custom_fields[cf.field_key] = val;
      }

      const existing = await findProductByPartNumber(partNo);
      if (existing) {
        await updateProduct(existing.id, {
          vendor_code: vendorCode,
          model,
          rev_no: revNo || existing.rev_no,
          customer: customer || existing.customer,
          custom_fields: { ...(existing.custom_fields || {}), ...custom_fields },
          modified_by: req.user?.username || 'import',
        });
        imported++;
      } else {
        await createProduct({
          part_number: partNo,
          vendor_code: vendorCode,
          model,
          rev_no: revNo || "A' / 01.01.2026",
          customer,
          custom_fields,
          created_by: req.user?.username || 'import',
        });
        imported++;
      }
    }

    return res.json({
      success: true,
      message: `Import completed. ${imported} products processed, ${skipped} skipped.`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

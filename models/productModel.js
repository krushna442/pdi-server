import { query, queryOne, execute } from '../db/db.js';

export async function initProductsTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      part_number VARCHAR(100) NOT NULL UNIQUE,
      vendor_code VARCHAR(100) NOT NULL,
      model VARCHAR(255) NOT NULL,
      rev_no VARCHAR(100) NOT NULL,
      customer VARCHAR(150) NOT NULL,
      status ENUM('active', 'inactive') DEFAULT 'active',
      custom_fields LONGTEXT DEFAULT NULL,
      part_image VARCHAR(500) DEFAULT NULL,
      created_by VARCHAR(100) DEFAULT 'system',
      modified_by VARCHAR(100) DEFAULT NULL,
      created_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_part_no (part_number),
      INDEX idx_customer (customer)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  // Safely check and add columns only if they do not exist
  try {
    const cols = await query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'"
    );
    const colNames = cols.map((c) => c.COLUMN_NAME);
    if (!colNames.includes('custom_fields')) {
      await execute(`ALTER TABLE products ADD COLUMN custom_fields LONGTEXT DEFAULT NULL;`);
    }
    if (!colNames.includes('part_image')) {
      await execute(`ALTER TABLE products ADD COLUMN part_image VARCHAR(500) DEFAULT NULL;`);
    }
  } catch (err) {
    console.warn('[Products] Safe column verification note:', err.message);
  }

  // Seed default products if empty
  const prodCount = await queryOne('SELECT COUNT(*) as count FROM products');
  if (prodCount && prodCount.count === 0) {
    console.log('[Products] Seeding default products...');
    await execute(
      `INSERT INTO products (part_number, vendor_code, model, rev_no, customer, status, part_image)
       VALUES 
       (?, ?, ?, ?, ?, 'active', ?),
       (?, ?, ?, ?, ?, 'active', ?)`,
      [
        '5081 3420 0148',
        'R64533',
        'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)',
        "C' / 05.06.2025",
        'TATA MOTORS  LTD.',
        'uploads/part_images/5081_3420_0148.png',
        '5081 3420 0143',
        'R64533',
        'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)',
        "H' / 28.01.2026",
        'TATA MOTORS  LTD.',
        'uploads/part_images/5081_3420_0143.png',
      ]
    );
  }

  // Create product_master_fields table for managing fields
  await execute(`
    CREATE TABLE IF NOT EXISTS product_master_fields (
      id INT AUTO_INCREMENT PRIMARY KEY,
      field_key VARCHAR(100) NOT NULL UNIQUE,
      label VARCHAR(150) NOT NULL,
      type VARCHAR(50) DEFAULT 'text',
      is_system TINYINT(1) DEFAULT 0,
      created_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  // Seed default product fields if empty
  const fieldsCount = await queryOne('SELECT COUNT(*) as count FROM product_master_fields');
  if (fieldsCount && fieldsCount.count === 0) {
    const defaultFields = [
      { key: 'part_number', label: 'Part No.', type: 'text', is_system: 1 },
      { key: 'vendor_code', label: 'Vendor Code', type: 'text', is_system: 1 },
      { key: 'model', label: 'Model (Description)', type: 'text', is_system: 1 },
      { key: 'rev_no', label: 'Rev No.', type: 'text', is_system: 1 },
      { key: 'customer', label: 'Customer', type: 'text', is_system: 1 },
    ];

    for (const f of defaultFields) {
      await execute(
        `INSERT INTO product_master_fields (field_key, label, type, is_system) VALUES (?, ?, ?, ?)`,
        [f.key, f.label, f.type, f.is_system]
      );
    }
  }

  // Pre-seed sample parts if not exist
  const countRow = await queryOne('SELECT COUNT(*) as count FROM products');
  if (countRow && countRow.count === 0) {
    console.log('[Products] Seeding sample products...');
    const samples = [
      {
        part_number: '5081 3420 0148',
        vendor_code: 'R64533',
        model: 'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)',
        rev_no: "C' / 05.06.2025",
        customer: 'TATA MOTORS  LTD.',
      },
      {
        part_number: '5081 3420 0143',
        vendor_code: 'R64533',
        model: 'FIFTH WHEEL ASSY WITH STRUCTURE (28 Ton)',
        rev_no: "H' / 28.01.2026",
        customer: 'TATA MOTORS  LTD.',
      },
    ];

    for (const p of samples) {
      await execute(
        `INSERT INTO products (part_number, vendor_code, model, rev_no, customer, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'active', 'system')`,
        [p.part_number, p.vendor_code, p.model, p.rev_no, p.customer]
      );
    }
    console.log('[Products] Sample products seeded successfully.');
  }
}

// ─── FIELD MANAGEMENT ────────────────────────────────────────────────────────

export async function getAllProductFields() {
  return await query('SELECT * FROM product_master_fields ORDER BY is_system DESC, id ASC');
}

export async function addProductField({ label, type = 'text' }) {
  if (!label || !label.trim()) throw new Error('Field label is required');

  // Generate safe field_key from label
  let key = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) key = 'field_' + Date.now();

  // Check collision
  const existing = await queryOne('SELECT id FROM product_master_fields WHERE field_key = ?', [key]);
  if (existing) {
    key = `${key}_${Date.now().toString().slice(-4)}`;
  }

  const result = await execute(
    `INSERT INTO product_master_fields (field_key, label, type, is_system) VALUES (?, ?, ?, 0)`,
    [key, label.trim(), type]
  );
  return await queryOne('SELECT * FROM product_master_fields WHERE id = ?', [result.insertId]);
}

export async function deleteProductField(field_key) {
  const field = await queryOne('SELECT * FROM product_master_fields WHERE field_key = ?', [field_key]);
  if (!field) throw new Error('Field not found');
  if (field.is_system) throw new Error('Cannot delete standard system field');

  return await execute('DELETE FROM product_master_fields WHERE field_key = ?', [field_key]);
}

// ─── PRODUCTS CRUD ───────────────────────────────────────────────────────────

const parseProduct = (row) => {
  if (!row) return null;
  return {
    ...row,
    custom_fields: typeof row.custom_fields === 'string' ? JSON.parse(row.custom_fields) : (row.custom_fields || {}),
  };
};

export async function findAllProducts({ search = '', customer = '', status = '' } = {}) {
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (part_number LIKE ? OR model LIKE ? OR vendor_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (customer) {
    sql += ' AND customer = ?';
    params.push(customer);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY updated_at DESC';
  const rows = await query(sql, params);
  return rows.map(parseProduct);
}

export async function findProductById(id) {
  const row = await queryOne('SELECT * FROM products WHERE id = ?', [id]);
  return parseProduct(row);
}

export async function findProductByPartNumber(partNumber) {
  if (!partNumber) return null;
  const cleanPart = partNumber.trim();
  const row = await queryOne('SELECT * FROM products WHERE part_number = ?', [cleanPart]);
  if (row) return parseProduct(row);

  const noSpace = cleanPart.replace(/\s+/g, '');
  const row2 = await queryOne(
    "SELECT * FROM products WHERE REPLACE(part_number, ' ', '') = ?",
    [noSpace]
  );
  return parseProduct(row2);
}

export async function createProduct({
  part_number,
  vendor_code,
  model,
  rev_no,
  customer,
  custom_fields = {},
  part_image = null,
  created_by = 'system',
}) {
  const result = await execute(
    `INSERT INTO products (part_number, vendor_code, model, rev_no, customer, custom_fields, part_image, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      part_number.trim(),
      vendor_code.trim(),
      model.trim(),
      rev_no.trim(),
      customer.trim(),
      JSON.stringify(custom_fields || {}),
      part_image || null,
      created_by,
    ]
  );
  return findProductById(result.insertId);
}

export async function updateProduct(id, {
  part_number,
  vendor_code,
  model,
  rev_no,
  customer,
  custom_fields,
  part_image,
  status,
  modified_by,
}) {
  const fields = [];
  const params = [];

  if (part_number !== undefined) { fields.push('part_number = ?'); params.push(part_number.trim()); }
  if (vendor_code !== undefined) { fields.push('vendor_code = ?'); params.push(vendor_code.trim()); }
  if (model !== undefined) { fields.push('model = ?'); params.push(model.trim()); }
  if (rev_no !== undefined) { fields.push('rev_no = ?'); params.push(rev_no.trim()); }
  if (customer !== undefined) { fields.push('customer = ?'); params.push(customer.trim()); }
  if (custom_fields !== undefined) { fields.push('custom_fields = ?'); params.push(JSON.stringify(custom_fields)); }
  if (part_image !== undefined) { fields.push('part_image = ?'); params.push(part_image); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (modified_by !== undefined) { fields.push('modified_by = ?'); params.push(modified_by); }

  if (fields.length === 0) return findProductById(id);

  params.push(id);
  await execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);
  return findProductById(id);
}

export async function deleteProduct(id) {
  return await execute('DELETE FROM products WHERE id = ?', [id]);
}

export async function getDropdownOptions() {
  const rows = await query(`
    SELECT
      GROUP_CONCAT(DISTINCT TRIM(customer) SEPARATOR '||') AS customers,
      GROUP_CONCAT(DISTINCT TRIM(vendor_code) SEPARATOR '||') AS vendorCodes,
      GROUP_CONCAT(DISTINCT TRIM(model) SEPARATOR '||') AS models,
      GROUP_CONCAT(DISTINCT TRIM(rev_no) SEPARATOR '||') AS revNos,
      GROUP_CONCAT(DISTINCT TRIM(part_number) SEPARATOR '||') AS partNos
    FROM products
    WHERE status = 'active'
  `);

  const r = rows[0] || {};
  const split = (str) => {
    if (!str) return [];
    return [...new Set(String(str).split('||').map((s) => s.trim()).filter(Boolean))];
  };

  return {
    CUSTOMER_OPTIONS: split(r.customers),
    VENDOR_CODE_OPTIONS: split(r.vendorCodes),
    MODEL_OPTIONS: split(r.models),
    REV_NO_OPTIONS: split(r.revNos),
    PART_NO_OPTIONS: split(r.partNos),
    // Convenience aliases
    customers: split(r.customers),
    vendorCodes: split(r.vendorCodes),
    models: split(r.models),
    revNos: split(r.revNos),
    partNos: split(r.partNos),
  };
}

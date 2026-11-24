import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD = 'Krushna72@',
  DB_NAME = 'rsb_pdi',
  DB_PORT = 3306,
} = process.env;

const isFresh = process.argv.includes('--fresh') || process.argv.includes('-f');

export async function bootstrapDatabase(targetDbName = DB_NAME, fresh = isFresh) {
  console.log(`\n===========================================================`);
  console.log(`🚀 RSB PDI SYSTEM — DATABASE BOOTSTRAPPER`);
  console.log(`===========================================================`);
  console.log(`Target Host:     ${DB_HOST}:${DB_PORT}`);
  console.log(`Target Database: ${targetDbName}`);
  console.log(`Mode:            ${fresh ? 'Fresh (Drop & Recreate)' : 'Safe (Create & Upsert)'}`);
  console.log(`===========================================================\n`);

  // Step 1: Ensure target database exists (with graceful fallback for cloud/shared hosts)
  try {
    const rootConn = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      port: Number(DB_PORT),
    });

    if (fresh) {
      try {
        console.log(`[1/4] Dropping existing database \`${targetDbName}\` (--fresh requested)...`);
        await rootConn.query(`DROP DATABASE IF EXISTS \`${targetDbName}\`;`);
      } catch (dropErr) {
        console.log(`[1/4] Note: Cloud host restricted DROP DATABASE. Individual tables will be cleared in \`${targetDbName}\` instead.`);
      }
    }

    console.log(`[1/4] Ensuring database \`${targetDbName}\` exists...`);
    await rootConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${targetDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await rootConn.end();
  } catch (rootErr) {
    console.log(`[1/4] Cloud host notice (${rootErr.message}). Connecting directly to target database \`${targetDbName}\`...`);
  }

  // Step 2: Connect to target database
  const db = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: targetDbName,
    port: Number(DB_PORT),
  });

  if (fresh) {
    console.log(`[2/4] Clearing existing tables in \`${targetDbName}\` (--fresh)...`);
    const tablesToDrop = [
      'scanned_products',
      'pending_approvals',
      'manual_pdi_documents',
      'pdi_templates',
      'dynamic_fields',
      'products',
      'product_master_fields',
      'users',
    ];
    await db.query('SET FOREIGN_KEY_CHECKS = 0;');
    for (const tbl of tablesToDrop) {
      await db.query(`DROP TABLE IF EXISTS \`${tbl}\`;`);
    }
    await db.query('SET FOREIGN_KEY_CHECKS = 1;');
  }

  // Step 3: Create all 8 tables with universally compatible structure (MySQL 5.5 to 8.4+)
  console.log(`[2/4] Initializing table schemas (8 tables in current structure)...`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(150) DEFAULT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('admin', 'QA HOD', 'QA INCHARGE', 'QA LINE') NOT NULL DEFAULT 'QA LINE',
      is_active TINYINT(1) DEFAULT 1,
      mail_types LONGTEXT DEFAULT NULL,
      created_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS product_master_fields (
      id INT AUTO_INCREMENT PRIMARY KEY,
      field_key VARCHAR(100) NOT NULL UNIQUE,
      label VARCHAR(150) NOT NULL,
      type VARCHAR(50) DEFAULT 'text',
      is_system TINYINT(1) DEFAULT 0,
      created_at DATETIME NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  await db.query(`
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS dynamic_fields (
      id INT AUTO_INCREMENT PRIMARY KEY,
      customer_names LONGTEXT NOT NULL,
      vendor_codes LONGTEXT NOT NULL,
      model_descriptions LONGTEXT NOT NULL,
      shift_settings LONGTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  await db.query(`
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS manual_pdi_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      part_number VARCHAR(100) NOT NULL,
      name VARCHAR(150) NOT NULL,
      file_path VARCHAR(255) NOT NULL,
      user_id INT NULL,
      role VARCHAR(50) DEFAULT 'QA LINE',
      created_at DATETIME NULL,
      INDEX idx_part (part_number),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_approvals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category VARCHAR(50) NOT NULL DEFAULT 'pdi_template',
      record_id VARCHAR(100) NOT NULL,
      record_identifier VARCHAR(255) NOT NULL,
      current_values LONGTEXT NOT NULL,
      proposed_values LONGTEXT NOT NULL,
      changed_fields LONGTEXT DEFAULT NULL,
      requested_by VARCHAR(100) NOT NULL,
      requested_by_role VARCHAR(50) NOT NULL,
      status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
      reviewed_by VARCHAR(100) DEFAULT NULL,
      reviewed_at DATETIME DEFAULT NULL,
      rejection_reason TEXT DEFAULT NULL,
      created_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS scanned_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      part_no VARCHAR(100) NOT NULL,
      vendor_code VARCHAR(100) DEFAULT '',
      model VARCHAR(255) DEFAULT '',
      rev_no VARCHAR(100) DEFAULT '',
      customer_name VARCHAR(150) DEFAULT '',
      part_sl_no VARCHAR(100) DEFAULT '',
      scanned_text TEXT NOT NULL,
      format VARCHAR(50) DEFAULT 'F2',
      shift VARCHAR(10) NOT NULL,
      validation_status ENUM('pass', 'fail', 'pending') DEFAULT 'pass',
      is_rejected TINYINT(1) DEFAULT 0,
      remarks TEXT DEFAULT NULL,
      plant_location VARCHAR(100) DEFAULT 'RSB JSR U - IV',
      created_by VARCHAR(100) NOT NULL,
      created_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_part (part_no),
      INDEX idx_shift (shift),
      INDEX idx_status (validation_status),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  // Step 4: Load and Seed data from seedData.json
  console.log(`[3/4] Loading seed records from seedData.json...`);
  const seedFilePath = path.join(__dirname, 'seedData.json');
  if (!fs.existsSync(seedFilePath)) {
    throw new Error(`Seed data file not found at: ${seedFilePath}`);
  }

  const seed = JSON.parse(fs.readFileSync(seedFilePath, 'utf8'));

  console.log(`[4/4] Seeding tables with current database stage data...`);

  // 1. Seed users
  for (const u of seed.users || []) {
    await db.query(
      `INSERT INTO users (id, name, username, email, password, role, is_active, mail_types, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         name=VALUES(name), email=VALUES(email), role=VALUES(role), 
         is_active=VALUES(is_active), mail_types=VALUES(mail_types);`,
      [
        u.id,
        u.name,
        u.username,
        u.email,
        u.password,
        u.role,
        u.is_active,
        typeof u.mail_types === 'string' ? u.mail_types : JSON.stringify(u.mail_types || []),
        u.created_at ? new Date(u.created_at) : new Date(),
      ]
    );
  }
  console.log(`  ✓ users:                  ${seed.users?.length || 0} seeded`);

  // 2. Seed product_master_fields
  for (const f of seed.product_master_fields || []) {
    await db.query(
      `INSERT INTO product_master_fields (id, field_key, label, type, is_system, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label=VALUES(label), type=VALUES(type);`,
      [f.id, f.field_key, f.label, f.type, f.is_system, f.created_at ? new Date(f.created_at) : new Date()]
    );
  }
  console.log(`  ✓ product_master_fields:  ${seed.product_master_fields?.length || 0} seeded`);

  // 3. Seed products
  for (const p of seed.products || []) {
    await db.query(
      `INSERT INTO products (id, part_number, vendor_code, model, rev_no, customer, status, custom_fields, part_image, created_by, modified_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         vendor_code=VALUES(vendor_code), model=VALUES(model), rev_no=VALUES(rev_no),
         customer=VALUES(customer), status=VALUES(status), custom_fields=VALUES(custom_fields),
         part_image=VALUES(part_image), modified_by=VALUES(modified_by);`,
      [
        p.id,
        p.part_number,
        p.vendor_code,
        p.model,
        p.rev_no,
        p.customer,
        p.status || 'active',
        p.custom_fields ? (typeof p.custom_fields === 'string' ? p.custom_fields : JSON.stringify(p.custom_fields)) : null,
        p.part_image || null,
        p.created_by || 'system',
        p.modified_by || null,
        p.created_at ? new Date(p.created_at) : new Date(),
        p.updated_at ? new Date(p.updated_at) : new Date(),
      ]
    );
  }
  console.log(`  ✓ products:               ${seed.products?.length || 0} seeded`);

  // 4. Seed dynamic_fields
  for (const df of seed.dynamic_fields || []) {
    await db.query(
      `INSERT INTO dynamic_fields (id, customer_names, vendor_codes, model_descriptions, shift_settings, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         customer_names=VALUES(customer_names), vendor_codes=VALUES(vendor_codes),
         model_descriptions=VALUES(model_descriptions), shift_settings=VALUES(shift_settings);`,
      [
        df.id,
        typeof df.customer_names === 'string' ? df.customer_names : JSON.stringify(df.customer_names || []),
        typeof df.vendor_codes === 'string' ? df.vendor_codes : JSON.stringify(df.vendor_codes || []),
        typeof df.model_descriptions === 'string' ? df.model_descriptions : JSON.stringify(df.model_descriptions || []),
        typeof df.shift_settings === 'string' ? df.shift_settings : JSON.stringify(df.shift_settings || []),
        df.updated_at ? new Date(df.updated_at) : new Date(),
      ]
    );
  }
  console.log(`  ✓ dynamic_fields:         ${seed.dynamic_fields?.length || 0} seeded`);

  // 5. Seed pdi_templates
  for (const t of seed.pdi_templates || []) {
    await db.query(
      `INSERT INTO pdi_templates (id, part_number, description, vendor_code, customer, draw_rev_no, format_no, issue_date, rev_no, rev_date, rows_json, updated_by, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         description=VALUES(description), vendor_code=VALUES(vendor_code), customer=VALUES(customer),
         draw_rev_no=VALUES(draw_rev_no), format_no=VALUES(format_no), issue_date=VALUES(issue_date),
         rev_no=VALUES(rev_no), rev_date=VALUES(rev_date), rows_json=VALUES(rows_json),
         updated_by=VALUES(updated_by), status=VALUES(status);`,
      [
        t.id,
        t.part_number,
        t.description,
        t.vendor_code,
        t.customer,
        t.draw_rev_no,
        t.format_no,
        t.issue_date,
        t.rev_no,
        t.rev_date,
        typeof t.rows_json === 'string' ? t.rows_json : JSON.stringify(t.rows_json),
        t.updated_by || 'system',
        t.status || 'active',
        t.created_at ? new Date(t.created_at) : new Date(),
        t.updated_at ? new Date(t.updated_at) : new Date(),
      ]
    );
  }
  console.log(`  ✓ pdi_templates:          ${seed.pdi_templates?.length || 0} seeded`);

  // 6. Seed manual_pdi_documents
  for (const d of seed.manual_pdi_documents || []) {
    await db.query(
      `INSERT INTO manual_pdi_documents (id, part_number, name, file_path, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), file_path=VALUES(file_path);`,
      [d.id, d.part_number, d.name, d.file_path, d.user_id, d.role, d.created_at ? new Date(d.created_at) : new Date()]
    );
  }
  console.log(`  ✓ manual_pdi_documents:   ${seed.manual_pdi_documents?.length || 0} seeded`);

  // 7. Seed pending_approvals
  for (const a of seed.pending_approvals || []) {
    await db.query(
      `INSERT INTO pending_approvals (id, category, record_id, record_identifier, current_values, proposed_values, changed_fields, requested_by, requested_by_role, status, reviewed_by, reviewed_at, rejection_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status=VALUES(status), reviewed_by=VALUES(reviewed_by), reviewed_at=VALUES(reviewed_at),
         rejection_reason=VALUES(rejection_reason);`,
      [
        a.id,
        a.category,
        a.record_id,
        a.record_identifier,
        typeof a.current_values === 'string' ? a.current_values : JSON.stringify(a.current_values),
        typeof a.proposed_values === 'string' ? a.proposed_values : JSON.stringify(a.proposed_values),
        a.changed_fields ? (typeof a.changed_fields === 'string' ? a.changed_fields : JSON.stringify(a.changed_fields)) : null,
        a.requested_by,
        a.requested_by_role,
        a.status || 'pending',
        a.reviewed_by || null,
        a.reviewed_at ? new Date(a.reviewed_at) : null,
        a.rejection_reason || null,
        a.created_at ? new Date(a.created_at) : new Date(),
        a.updated_at ? new Date(a.updated_at) : new Date(),
      ]
    );
  }
  console.log(`  ✓ pending_approvals:      ${seed.pending_approvals?.length || 0} seeded`);

  // 8. Seed scanned_products (batch insertion)
  const scanned = seed.scanned_products || [];
  const batchSize = 50;
  for (let i = 0; i < scanned.length; i += batchSize) {
    const chunk = scanned.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    chunk.forEach((s) => {
      params.push(
        s.id,
        s.part_no,
        s.vendor_code || '',
        s.model || '',
        s.rev_no || '',
        s.customer_name || '',
        s.part_sl_no || '',
        s.scanned_text,
        s.format || 'F2',
        s.shift,
        s.validation_status || 'pass',
        s.is_rejected ? 1 : 0,
        s.remarks || null,
        s.plant_location || 'RSB JSR U - IV',
        s.created_by,
        s.created_at ? new Date(s.created_at) : new Date(),
        s.updated_at ? new Date(s.updated_at) : new Date()
      );
    });

    await db.query(
      `INSERT IGNORE INTO scanned_products 
       (id, part_no, vendor_code, model, rev_no, customer_name, part_sl_no, scanned_text, format, shift, validation_status, is_rejected, remarks, plant_location, created_by, created_at, updated_at)
       VALUES ${placeholders};`,
      params
    );
  }
  console.log(`  ✓ scanned_products:       ${scanned.length} seeded`);

  await db.end();

  console.log(`\n===========================================================`);
  console.log(`✅ BOOTSTRAP COMPLETE: Database \`${targetDbName}\` is 100% ready!`);
  console.log(`===========================================================\n`);
}

// Direct execution via CLI
if (
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase()
) {
  bootstrapDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ Bootstrap failed:', err);
      process.exit(1);
    });
}

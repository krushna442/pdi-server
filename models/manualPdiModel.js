import { query, queryOne, execute } from '../db/db.js';

export async function initManualPdiTable() {
  await execute(`
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
}

export async function createManualPdiDocument({ part_number, name, file_path, user_id = null, role = 'QA LINE' }) {
  const result = await execute(
    `INSERT INTO manual_pdi_documents (part_number, name, file_path, user_id, role)
     VALUES (?, ?, ?, ?, ?)`,
    [part_number.trim().toUpperCase(), name.trim(), file_path, user_id, role]
  );
  return await queryOne('SELECT * FROM manual_pdi_documents WHERE id = ?', [result.insertId]);
}

export async function findAllManualPdiDocuments() {
  return await query('SELECT * FROM manual_pdi_documents ORDER BY created_at DESC');
}

export async function findManualPdiById(id) {
  return await queryOne('SELECT * FROM manual_pdi_documents WHERE id = ?', [id]);
}

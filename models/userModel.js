import { query, queryOne, execute } from '../db/db.js';
import bcrypt from 'bcryptjs';

export const VALID_ROLES = ['admin', 'QA HOD', 'QA INCHARGE', 'QA LINE'];

export async function initUsersTable() {
  await execute(`
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

  // Check if any users exist, if not seed default users
  const countRow = await queryOne('SELECT COUNT(*) as count FROM users');
  if (countRow && countRow.count === 0) {
    console.log('[Users] Seeding default users...');
    const hashed = await bcrypt.hash('password123', 10);
    const defaults = [
      { name: 'System Admin', username: 'admin', email: 'admin@rsbglobal.com', role: 'admin', mailTypes: ['pdi_report', 'scan_report'] },
      { name: 'Quality HOD', username: 'qahod', email: 'qahod@rsbglobal.com', role: 'QA HOD', mailTypes: ['pdi_report', 'scan_report'] },
      { name: 'QA Incharge', username: 'qaincharge', email: 'qaincharge@rsbglobal.com', role: 'QA INCHARGE', mailTypes: ['scan_report'] },
      { name: 'QA Line Inspector', username: 'qaline', email: 'qaline@rsbglobal.com', role: 'QA LINE', mailTypes: [] },
    ];

    for (const u of defaults) {
      await execute(
        `INSERT INTO users (name, username, email, password, role, is_active, mail_types) VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [u.name, u.username, u.email, hashed, u.role, JSON.stringify(u.mailTypes)]
      );
    }
    console.log('[Users] Default users seeded successfully with password: password123');
  }
}

const parseUserRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    mail_types: typeof row.mail_types === 'string' ? JSON.parse(row.mail_types) : (row.mail_types || []),
  };
};

export async function findAllUsers() {
  const rows = await query('SELECT id, name, username, email, role, is_active, mail_types, created_at, updated_at FROM users ORDER BY id ASC');
  return rows.map(parseUserRow);
}

export async function findUserById(id) {
  const row = await queryOne('SELECT id, name, username, email, role, is_active, mail_types, created_at, updated_at FROM users WHERE id = ?', [id]);
  return parseUserRow(row);
}

export async function findUserByUsername(username) {
  const row = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
  return parseUserRow(row);
}

export async function createUser({ name, username, email, password, role = 'QA LINE', mail_types = [] }) {
  const hashedPassword = await bcrypt.hash(password, 10);
  const result = await execute(
    `INSERT INTO users (name, username, email, password, role, is_active, mail_types) VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [name, username, email || null, hashedPassword, role, JSON.stringify(mail_types)]
  );
  return findUserById(result.insertId);
}

export async function updateUser(id, { name, username, email, password, role, is_active, mail_types }) {
  const fields = [];
  const params = [];

  if (name !== undefined) { fields.push('name = ?'); params.push(name); }
  if (username !== undefined) { fields.push('username = ?'); params.push(username); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email || null); }
  if (role !== undefined) { fields.push('role = ?'); params.push(role); }
  if (is_active !== undefined) { fields.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (mail_types !== undefined) { fields.push('mail_types = ?'); params.push(JSON.stringify(mail_types)); }
  if (password) {
    const hashed = await bcrypt.hash(password, 10);
    fields.push('password = ?');
    params.push(hashed);
  }

  if (fields.length === 0) return findUserById(id);

  params.push(id);
  await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
  return findUserById(id);
}

export async function deleteUser(id) {
  return await execute('DELETE FROM users WHERE id = ?', [id]);
}

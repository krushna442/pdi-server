import { query, queryOne, execute } from '../db/db.js';
import { saveTemplate } from './pdiTemplateModel.js';

export async function initPendingApprovalsTable() {
  await execute(`
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
}

const parseApproval = (row) => {
  if (!row) return null;
  return {
    ...row,
    current_values: typeof row.current_values === 'string' ? JSON.parse(row.current_values) : (row.current_values || {}),
    proposed_values: typeof row.proposed_values === 'string' ? JSON.parse(row.proposed_values) : (row.proposed_values || {}),
    changed_fields: typeof row.changed_fields === 'string' ? JSON.parse(row.changed_fields) : (row.changed_fields || []),
  };
};

export async function createPendingApproval({
  category = 'pdi_template',
  record_id,
  record_identifier,
  current_values,
  proposed_values,
  changed_fields = [],
  requested_by,
  requested_by_role,
}) {
  const result = await execute(
    `INSERT INTO pending_approvals (
      category, record_id, record_identifier, current_values,
      proposed_values, changed_fields, requested_by, requested_by_role, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      category,
      String(record_id),
      record_identifier,
      JSON.stringify(current_values),
      JSON.stringify(proposed_values),
      JSON.stringify(changed_fields),
      requested_by,
      requested_by_role,
    ]
  );
  return findApprovalById(result.insertId);
}

export async function findApprovalById(id) {
  const row = await queryOne('SELECT * FROM pending_approvals WHERE id = ?', [id]);
  return parseApproval(row);
}

export async function findAllPendingApprovals({ status = '' } = {}) {
  let sql = 'SELECT * FROM pending_approvals WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY created_at DESC';
  const rows = await query(sql, params);
  return rows.map(parseApproval);
}

export async function approvePendingRequest(id, reviewed_by) {
  const item = await findApprovalById(id);
  if (!item) throw new Error('Approval request not found');
  if (item.status === 'approved') throw new Error('Request is already approved');

  if (item.category === 'pdi_template') {
    // Commit proposed values into pdi_templates
    await saveTemplate({
      ...item.proposed_values,
      updated_by: reviewed_by,
    });
  }

  await execute(
    `UPDATE pending_approvals SET status = 'approved', reviewed_by = ?, reviewed_at = NOW() WHERE id = ?`,
    [reviewed_by, id]
  );

  return findApprovalById(id);
}

export async function rejectPendingRequest(id, reviewed_by, rejection_reason = '') {
  const item = await findApprovalById(id);
  if (!item) throw new Error('Approval request not found');
  if (item.status === 'rejected') throw new Error('Request is already rejected');

  await execute(
    `UPDATE pending_approvals SET status = 'rejected', reviewed_by = ?, reviewed_at = NOW(), rejection_reason = ? WHERE id = ?`,
    [reviewed_by, rejection_reason || 'Rejected by QA HOD/Admin', id]
  );

  return findApprovalById(id);
}

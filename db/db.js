import { pool } from './pool.js';

export async function query(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows;
  } catch (error) {
    console.error('DB query error:', error);
    throw error;
  }
}

export async function queryOne(sql, params = []) {
  try {
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
  } catch (error) {
    console.error('DB queryOne error:', error);
    throw error;
  }
}

export async function execute(sql, params = []) {
  try {
    const [result] = await pool.execute(sql, params);
    return result;
  } catch (error) {
    console.error('DB execute error:', error);
    throw error;
  }
}

export async function getConnection() {
  return await pool.getConnection();
}

export { pool };

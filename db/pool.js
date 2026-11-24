import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const {
  DB_HOST = 'localhost',
  DB_USER = 'root',
  DB_PASSWORD = 'Krushna72@',
  DB_NAME = 'rsb_pdi',
  DB_PORT = 3306,
} = process.env;

// Initialize database if it doesn't exist
async function ensureDatabase() {
  try {
    const rootConnection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      port: Number(DB_PORT),
    });
    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await rootConnection.end();
    console.log(`[Database] Ensured database \`${DB_NAME}\` exists.`);
  } catch (err) {
    // On hosted / remote cloud databases, CREATE DATABASE may be restricted or DB already exists
    console.log(`[Database] Connecting directly to database \`${DB_NAME}\` on ${DB_HOST}:${DB_PORT}`);
  }
}

await ensureDatabase();

export const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: Number(DB_PORT),
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

import mysql from 'mysql2/promise';
import { logMessage } from './logger';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'nantafood.cloudtime.me',
  port: Number(process.env.MYSQL_PORT) || 39005,
  user: process.env.MYSQL_USER || 'nantafood',
  password: process.env.MYSQL_PASSWORD || 'N@ntaf00d',
  database: process.env.MYSQL_DATABASE || 'bsv5',
  connectionLimit: 10,
  connectTimeout: 30000, //
});

export async function query<T>(sql: string, params: any[] = []): Promise<T> {
  try {
    const [results] = await pool.execute(sql, params);
    return results as T;
  } catch (error: any) {
    logMessage(`MySQL query error: ${error.message}`);
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
      logMessage('Network error occurred. Retrying...');
      throw error; // Let the retry mechanism handle it
    }
    throw error;
  }
}

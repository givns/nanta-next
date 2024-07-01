// utils/mysqlConnection.ts
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: 'nantafood.cloudtime.me',
  port: 39005,
  user: 'nantafood',
  password: 'N@ntaf00d',
  database: 'bsv5',
  connectionLimit: 10,
});

export async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  const [results] = await pool.execute(sql, params);
  return results as T[];
}

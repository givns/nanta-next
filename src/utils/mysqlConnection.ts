// utils/mysqlConnection.ts

import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  connectionLimit: 10,
});

export async function query<T>(sql: string, params: any[] = []): Promise<T[]> {
  const [results] = await pool.execute(sql, params);
  return results as T[];
}

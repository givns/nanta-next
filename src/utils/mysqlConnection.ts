import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'nantafood.cloudtime.me',
  port: Number(process.env.MYSQL_PORT) || 39005,
  user: process.env.MYSQL_USER || 'nantafood',
  password: process.env.MYSQL_PASSWORD || 'N@ntaf00d',
  database: process.env.MYSQL_DATABASE || 'bsv5',
  connectionLimit: 10,
});

export async function query<T>(sql: string, values: any[] = []): Promise<T> {
  const [rows] = await pool.execute(sql, values);
  return rows as T;
}

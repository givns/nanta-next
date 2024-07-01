import mysql from 'serverless-mysql';

const db = mysql({
  config: {
    host: 'nantafood.cloudtime.me',
    port: 39005,
    database: 'bsv5',
    user: 'nantafood',
    password: 'N@ntaf00d',
  },
});

export default async function executeQuery({
  query,
  values,
}: {
  query: string;
  values: any[];
}) {
  try {
    const results = await db.query(query, values);
    await db.end();
    return results;
  } catch (error) {
    return { error };
  }
}

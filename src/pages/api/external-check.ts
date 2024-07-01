import type { NextApiRequest, NextApiResponse } from 'next';
import { query } from '../../utils/mysqlConnection';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId, startDate, endDate } = req.query;

  if (!userId || !startDate || !endDate) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  try {
    const results = await query(
      `SELECT * FROM atttime 
       WHERE user_serial = ? 
       AND sj BETWEEN ? AND ?
       ORDER BY sj DESC`,
      [userId, startDate, endDate],
    );

    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching external check data:', error);
    res
      .status(500)
      .json({ message: 'Error fetching data from external device' });
  }
}

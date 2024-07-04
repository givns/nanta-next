// pages/api/getExternalUserData.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { query } from '../../utils/mysqlConnection';
import { ExternalCheckInData } from '../../types/user';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  try {
    const rows = await query<ExternalCheckInData[]>(
      'SELECT * FROM dt_user WHERE user_no = ?',
      [employeeId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = rows[0];
    res.status(200).json({
      name: `${userData.user_fname} ${userData.user_lname}`.trim(),
      department: userData.user_depname || userData.user_dep,
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

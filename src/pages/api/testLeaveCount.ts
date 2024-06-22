import type { NextApiRequest, NextApiResponse } from 'next';
import getLeaveCountForAdmin from '../../utils/getLeaveCountForAdmin'; // Adjust the import path as needed

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { adminId } = req.query;

  if (!adminId || typeof adminId !== 'string') {
    return res
      .status(400)
      .json({ error: 'adminId is required and must be a string' });
  }

  try {
    const count = await getLeaveCountForAdmin(adminId);
    res.status(200).json({ count });
  } catch (error) {
    console.error('Error fetching leave count:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

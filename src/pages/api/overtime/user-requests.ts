// pages/api/overtime/user-requests.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';

const overtimeService = new OvertimeServiceServer();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    const overtimeRequests = await overtimeService.getOvertimeRequests(userId);
    res.status(200).json(overtimeRequests);
  } catch (error) {
    console.error('Error fetching user overtime requests:', error);
    res.status(500).json({ message: 'Failed to fetch overtime requests' });
  }
}

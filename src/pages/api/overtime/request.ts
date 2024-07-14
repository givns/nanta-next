// pages/api/overtime/request.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { OvertimeService } from '../../../services/OvertimeService';

const overtimeService = new OvertimeService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId, date, startTime, endTime, reason } = req.body;

  try {
    const overtimeRequest = await overtimeService.createOvertimeRequest(
      userId,
      new Date(date),
      startTime,
      endTime,
      reason,
    );
    res.status(201).json(overtimeRequest);
  } catch (error) {
    console.error('Error creating overtime request:', error);
    res.status(500).json({ message: 'Failed to create overtime request' });
  }
}

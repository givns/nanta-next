// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';

const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    const status =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    res.status(200).json(status);
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({
      message: 'Error checking status',
      error: (error as Error).message,
    });
  }
}

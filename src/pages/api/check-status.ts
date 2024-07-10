// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';

const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ message: 'Valid Employee ID is required' });
  }

  try {
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    res.status(200).json(attendanceStatus);
  } catch (error: any) {
    console.error('Error in check-status handler:', error);
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || 'Error checking status' });
  }
}

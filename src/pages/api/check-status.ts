// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';

const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Received request for check-status');
  console.log('Query parameters:', req.query);

  if (req.method !== 'GET') {
    console.log('Method not allowed:', req.method);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    console.error('Invalid or missing employeeId:', employeeId);
    return res.status(400).json({ message: 'Valid Employee ID is required' });
  }

  try {
    console.log('Fetching attendance status for employeeId:', employeeId);
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    console.log(
      'Attendance status retrieved:',
      JSON.stringify(attendanceStatus, null, 2),
    );

    return res.status(200).json(attendanceStatus);
  } catch (error: any) {
    console.error('Error in check-status handler:', error);
    return res
      .status(error.statusCode || 500)
      .json({ message: error.message || 'Error checking status' });
  }
}

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
    return res.status(400).json({ message: 'Valid Employee ID is required' });
  }

  try {
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    console.log(
      `Attendance status retrieved for ${employeeId}:`,
      JSON.stringify(attendanceStatus),
    );
    res.status(200).json(attendanceStatus);
  } catch (error: any) {
    console.error('Error checking status:', error);
    res
      .status(error.statusCode || 500)
      .json({ message: error.message || 'Error checking status' });
  }
}

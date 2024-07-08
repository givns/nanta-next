// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '../../services/ShiftManagementService';

const attendanceService = new AttendanceService();
const shiftManagementService = new ShiftManagementService();

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
    console.log(`Checking status for employee ID: ${employeeId}`);

    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    console.log(`Attendance status retrieved for ${employeeId}`);

    // Fetch shift adjustment if needed
    const shiftAdjustment =
      await shiftManagementService.getShiftAdjustmentForDate(
        attendanceStatus.user.id,
        new Date(),
      );
    console.log(`Shift adjustment retrieved for ${employeeId}`);

    res.status(200).json({
      ...attendanceStatus,
      shiftAdjustment,
    });
  } catch (error: any) {
    console.error('Error checking status:', error);
    if (error.message === 'User not found') {
      res.status(404).json({ message: 'User not found' });
    } else if (error.message === 'User has no assigned shift') {
      res.status(400).json({ message: 'User has no assigned shift' });
    } else {
      res
        .status(500)
        .json({ message: 'Error checking status', error: error.message });
    }
  }
}

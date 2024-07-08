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
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    console.log(`Attendance status retrieved for ${employeeId}`);

    const shiftAdjustment =
      await shiftManagementService.getShiftAdjustmentForDate(
        attendanceStatus.user.id,
        new Date(),
      );
    console.log(
      `Shift adjustment retrieved for ${employeeId}:`,
      shiftAdjustment,
    );

    // Combine the information
    const combinedStatus = {
      ...attendanceStatus,
      shiftAdjustment: shiftAdjustment
        ? {
            ...shiftAdjustment,
            requestedShift: shiftAdjustment.requestedShift,
          }
        : null,
    };

    res.status(200).json(combinedStatus);
  } catch (error: any) {
    console.error('Error checking status:', error);
    res.status(500).json({ message: error.message || 'Error checking status' });
  }
}

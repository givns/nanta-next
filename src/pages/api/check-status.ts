// pages/api/check-status.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '../../services/ShiftManagementService';
import { formatDate } from '../../utils/dateUtils';

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

    const shiftAdjustment =
      await shiftManagementService.getShiftAdjustmentForDate(
        attendanceStatus.user.id,
        new Date(),
      );

    console.log(
      `Shift adjustment retrieved for ${employeeId}:`,
      shiftAdjustment,
    );

    const formattedStatus = {
      ...attendanceStatus,
      latestAttendance: attendanceStatus.latestAttendance
        ? {
            ...attendanceStatus.latestAttendance,
            checkInTime: attendanceStatus.latestAttendance.checkInTime
              ? formatDate(attendanceStatus.latestAttendance.checkInTime)
              : null,
            checkOutTime: attendanceStatus.latestAttendance.checkOutTime
              ? formatDate(attendanceStatus.latestAttendance.checkOutTime)
              : null,
          }
        : null,
      shiftAdjustment: shiftAdjustment
        ? {
            ...shiftAdjustment,
            date: formatDate(shiftAdjustment.date),
          }
        : null,
    };

    res.status(200).json({
      ...attendanceStatus,
      shiftAdjustment: shiftAdjustment || null,
    });
  } catch (error: any) {
    console.error('Error checking status:', error);
    res.status(500).json({ message: error.message || 'Error checking status' });
  }
}

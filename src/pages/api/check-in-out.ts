// check-in-out.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';

const attendanceService = new AttendanceService();
const shiftService = new ShiftManagementService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    userId,
    employeeId,
    checkTime,
    location,
    address,
    reason,
    photo,
    deviceSerial,
    isCheckIn,
  } = req.body;

  // Validate required fields
  if (
    !userId ||
    !employeeId ||
    !checkTime ||
    !location ||
    !address ||
    !deviceSerial ||
    typeof isCheckIn !== 'boolean'
  ) {
    return res
      .status(400)
      .json({ message: 'Missing or invalid required fields' });
  }

  try {
    // Get the user's shift and attendance status
    const shift = await shiftService.getUserShift(userId);
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(userId);

    if (!shift) {
      return res.status(400).json({ message: 'User shift not found' });
    }

    const now = new Date(checkTime);
    const {
      shiftStart,
      shiftEnd,
      flexibleStart,
      flexibleEnd,
      graceStart,
      graceEnd,
    } = calculateShiftTimes(now, shift.startTime, shift.endTime);

    const isOutsideShift = now < shiftStart || now > shiftEnd;
    const isFlexibleStart = now >= flexibleStart && now < shiftStart;
    const isFlexibleEnd = now > shiftEnd && now <= flexibleEnd;
    const isWithinGracePeriod =
      (now >= graceStart && now <= shiftStart) ||
      (now >= shiftEnd && now <= graceEnd);

    const isCheckInOutAllowed =
      attendanceStatus.approvedOvertime ||
      !isOutsideShift ||
      isFlexibleStart ||
      isFlexibleEnd ||
      isWithinGracePeriod;

    if (!isCheckInOutAllowed) {
      return res
        .status(400)
        .json({ message: 'Check-in/out not allowed at this time' });
    }

    const attendance = await attendanceService.processAttendance({
      userId,
      employeeId,
      checkTime,
      location,
      address,
      reason,
      photo,
      deviceSerial,
      isCheckIn,
      isOvertime: attendanceStatus.approvedOvertime ? true : undefined,
      isFlexibleStart,
      isFlexibleEnd,
      isWithinGracePeriod,
    });

    res.status(200).json(attendance);
  } catch (error: any) {
    console.error('Check-in/out failed:', error);
    res.status(error.statusCode || 500).json({
      message: 'Check-in/out failed',
      error: error.message,
    });
  }
}

function calculateShiftTimes(now: Date, startTime: string, endTime: string) {
  const shiftStart = new Date(now);
  const shiftEnd = new Date(now);
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);

  shiftStart.setHours(startHour, startMinute, 0, 0);
  shiftEnd.setHours(endHour, endMinute, 0, 0);

  // Handle overnight shifts
  if (shiftEnd <= shiftStart) {
    shiftEnd.setDate(shiftEnd.getDate() + 1);
  }

  const flexibleStart = new Date(shiftStart.getTime() - 30 * 60000); // 30 minutes before shift start
  const flexibleEnd = new Date(shiftEnd.getTime() + 30 * 60000); // 30 minutes after shift end
  const graceStart = new Date(shiftStart.getTime() - 5 * 60000); // 5 minutes before shift start
  const graceEnd = new Date(shiftEnd.getTime() + 5 * 60000); // 5 minutes after shift end

  return {
    shiftStart,
    shiftEnd,
    flexibleStart,
    flexibleEnd,
    graceStart,
    graceEnd,
  };
}

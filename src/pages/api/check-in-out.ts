// pages/api/check-in-out.ts

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

  console.log('Received check-in/out request:', req.body);

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
    isOvertime,
    isLate,
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
    console.error('Missing or invalid required fields:', req.body);
    return res
      .status(400)
      .json({ message: 'Missing or invalid required fields' });
  }

  try {
    console.log(`Getting shift for user: ${userId}`);
    const shift = await shiftService.getUserShift(userId);
    console.log('User shift:', shift);

    console.log(`Getting attendance status for employee: ${employeeId}`);
    const attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);
    console.log('Attendance status:', attendanceStatus);

    if (!shift) {
      console.error(`Shift not found for user: ${userId}`);
      return res.status(400).json({ message: 'User shift not found' });
    }

    const now = new Date(checkTime);
    console.log('Check time:', now);

    const {
      shiftStart,
      shiftEnd,
      flexibleStart,
      flexibleEnd,
      graceStart,
      graceEnd,
    } = calculateShiftTimes(now, shift.startTime, shift.endTime);

    console.log('Calculated shift times:', {
      shiftStart,
      shiftEnd,
      flexibleStart,
      flexibleEnd,
      graceStart,
      graceEnd,
    });

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

    console.log('Check-in/out allowed:', isCheckInOutAllowed);

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
      isOvertime: attendanceStatus.approvedOvertime ? true : isOvertime,
      isLate,
      isFlexibleStart,
      isFlexibleEnd,
      isWithinGracePeriod,
    });

    console.log('Processed attendance:', attendance);

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

  const flexibleStart = new Date(shiftStart.getTime() - 30 * 60000);
  const flexibleEnd = new Date(shiftEnd.getTime() + 30 * 60000);
  const graceStart = new Date(shiftStart.getTime() - 5 * 60000);
  const graceEnd = new Date(shiftEnd.getTime() + 5 * 60000);

  return {
    shiftStart,
    shiftEnd,
    flexibleStart,
    flexibleEnd,
    graceStart,
    graceEnd,
  };
}

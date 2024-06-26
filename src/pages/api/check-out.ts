import type { NextApiRequest, NextApiResponse } from 'next';
import {
  sendConfirmationMessage,
  sendDailySummary,
} from '../../utils/lineNotifications';
import { attendanceService } from '../../services/AttendanceService';
import { CheckOutFormData } from '../../types/user';
import prisma from '@/lib/prisma';
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    attendanceId,
    location,
    address,
    reason,
    photo,
    timestamp,
    deviceSerial,
  }: CheckOutFormData = req.body;

  try {
    const checkOutTime = new Date(timestamp);
    if (isNaN(checkOutTime.getTime())) {
      throw new Error('Invalid timestamp provided');
    }

    // Use AttendanceService for check-out
    const { attendance: updatedAttendance, user } =
      await attendanceService.checkOut({
        attendanceId,
        location,
        address,
        reason,
        photo,
        deviceSerial,
      });

    // Send confirmation message
    await sendConfirmationMessage(user.lineUserId, false, checkOutTime);

    // Calculate work hours and send daily summary
    const workHours = calculateWorkHours(
      updatedAttendance.checkInTime,
      checkOutTime,
    );
    const monthlyWorkDays = await getMonthlyWorkDays(updatedAttendance.userId);
    await sendDailySummary(user.lineUserId, workHours, monthlyWorkDays);

    res.status(200).json({
      message: 'Check-out successful',
      data: { attendance: updatedAttendance, user },
    });
  } catch (error) {
    console.error('Error during check-out:', error);
    res.status(500).json({
      message: 'Error processing check-out',
      error: (error as Error).message,
    });
  }
}

function calculateWorkHours(checkInTime: Date, checkOutTime: Date): number {
  const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
  let totalMilliseconds = checkOutTime.getTime() - checkInTime.getTime();

  // Adjust for lunch break (12 PM to 1 PM)
  const lunchStart = new Date(checkInTime).setHours(12, 0, 0, 0);
  const lunchEnd = new Date(checkInTime).setHours(13, 0, 0, 0);
  if (checkInTime.getTime() < lunchEnd && checkOutTime.getTime() > lunchStart) {
    totalMilliseconds -= Math.min(
      oneHour,
      Math.max(
        0,
        Math.min(checkOutTime.getTime(), lunchEnd) -
          Math.max(checkInTime.getTime(), lunchStart),
      ),
    );
  }

  // Adjust for dinner break (6 PM to 7 PM)
  const dinnerStart = new Date(checkInTime).setHours(18, 0, 0, 0);
  const dinnerEnd = new Date(checkInTime).setHours(19, 0, 0, 0);
  if (
    checkInTime.getTime() < dinnerEnd &&
    checkOutTime.getTime() > dinnerStart
  ) {
    totalMilliseconds -= Math.min(
      oneHour,
      Math.max(
        0,
        Math.min(checkOutTime.getTime(), dinnerEnd) -
          Math.max(checkInTime.getTime(), dinnerStart),
      ),
    );
  }

  return totalMilliseconds / (1000 * 60 * 60); // Convert milliseconds to hours
}

async function getMonthlyWorkDays(userId: string): Promise<number> {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  // If today is before the 26th, we're still in the previous payroll period
  const startDate =
    today.getDate() < 26
      ? new Date(year, month - 1, 26)
      : new Date(year, month, 26);

  const endDate =
    today.getDate() < 26
      ? new Date(year, month, 25)
      : new Date(year, month + 1, 25);

  const workDays = await prisma.attendance.groupBy({
    by: ['userId'],
    where: {
      userId: userId,
      checkInTime: {
        gte: startDate,
        lte: endDate,
      },
      checkOutTime: {
        not: null,
      },
    },
    _count: {
      _all: true,
    },
  });

  return workDays[0]?._count._all ?? 0;
}

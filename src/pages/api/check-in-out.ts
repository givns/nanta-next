// pages/api/check-in-out.ts

import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { leaveServiceServer } from '@/services/LeaveServiceServer';
import { AttendanceData } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { NotificationService } from '@/services/NotificationService';
import { OvertimeNotificationService } from '@/services/OvertimeNotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';
import { getBangkokTime, formatBangkokTime } from '@/utils/dateUtils';

const prisma = new PrismaClient();
const overtimeNotificationService = new OvertimeNotificationService();
const timeEntryService = new TimeEntryService(prisma);
const overtimeService = new OvertimeServiceServer(
  prisma,
  overtimeNotificationService,
  timeEntryService,
);
const notificationService = new NotificationService();
const shiftService = new ShiftManagementService(prisma);
const holidayService = new HolidayService(prisma);

const attendanceService = new AttendanceService(
  prisma,
  shiftService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
  timeEntryService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  console.log('Received check-in/out request:', req.body);

  const attendanceData: AttendanceData = req.body;

  try {
    const attendanceStatus = await attendanceService.getLatestAttendanceStatus(
      attendanceData.employeeId,
    );

    if (attendanceStatus.isDayOff && !attendanceData.isOvertime) {
      return res
        .status(400)
        .json({ message: 'Cannot check in/out on day off without overtime' });
    }

    const processedAttendance =
      await attendanceService.processAttendance(attendanceData);

    console.log('Processed attendance:', processedAttendance);

    // Send notification using NotificationService
    const currentTime = getBangkokTime();
    if (attendanceData.isCheckIn) {
      await notificationService.sendCheckInConfirmation(
        attendanceData.employeeId,
        currentTime,
      );
    } else {
      await notificationService.sendCheckOutConfirmation(
        attendanceData.employeeId,
        currentTime,
      );
    }

    res.status(200).json(processedAttendance);
  } catch (error: any) {
    console.error('Check-in/out failed:', error);
    console.error('Error stack:', error.stack);
    res.status(error.statusCode || 500).json({
      message: 'Check-in/out failed',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

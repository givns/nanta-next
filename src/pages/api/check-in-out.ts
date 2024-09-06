//api/check-in-out.ts
import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { Shift104HolidayService } from '@/services/Shift104HolidayService';
import { leaveServiceServer } from '@/services/LeaveServiceServer';
import { AttendanceData } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { NotificationService } from '@/services/NotificationService';
import { OvertimeNotificationService } from '@/services/OvertimeNotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';

const prisma = new PrismaClient();
const overtimeNotificationService = new OvertimeNotificationService();
const timeEntryService = new TimeEntryService();

const overtimeService = new OvertimeServiceServer(
  prisma,
  overtimeNotificationService,
  timeEntryService,
);

const notificationService = new NotificationService();
const shiftService = new ShiftManagementService(prisma);
const holidayService = new HolidayService();
const shift104HolidayService = new Shift104HolidayService();

const attendanceService = new AttendanceService(
  prisma,
  shiftService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
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

    // Additional checks using attendanceStatus
    if (attendanceStatus.isDayOff && !attendanceData.isOvertime) {
      return res
        .status(400)
        .json({ message: 'Cannot check in/out on day off without overtime' });
    }

    // Process attendance
    const processedAttendance =
      await attendanceService.processAttendance(attendanceData);

    console.log('Processed attendance:', processedAttendance);

    res.status(200).json(processedAttendance);
  } catch (error: any) {
    console.error('Check-in/out failed:', error);
    res.status(error.statusCode || 500).json({
      message: 'Check-in/out failed',
      error: error.message,
    });
  }
}

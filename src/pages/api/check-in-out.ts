// pages/api/check-in-out.ts

import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { leaveServiceServer } from '@/services/LeaveServiceServer';
import { AttendanceData, AttendanceStatusInfo } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { NotificationService } from '@/services/NotificationService';
import { OvertimeNotificationService } from '@/services/OvertimeNotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';
import {
  getBangkokTime,
  formatBangkokTime,
  formatDate,
  formatTime,
} from '@/utils/dateUtils';
import { errorLogger } from '../../utils/errorLogger';
import { retryOperation } from '../../utils/retryOperation';
import { performance } from 'perf_hooks';
import { NoWorkDayService } from '@/services/NoWorkDayService';
import { Queue } from 'bullmq';
import { PrismaClientValidationError } from '@prisma/client/runtime/library';
const notificationQueue = new Queue('notifications');

const prisma = new PrismaClient();
const overtimeNotificationService = new OvertimeNotificationService();
const timeEntryService = new TimeEntryService(
  prisma,
  new ShiftManagementService(prisma),
);
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

  const attendanceData: AttendanceData = req.body;

  // Ensure checkTime is in the correct format
  if (typeof attendanceData.checkTime === 'string') {
    // If it's just time (HH:mm:ss), prepend today's date
    if (attendanceData.checkTime.length <= 8) {
      const now = new Date();
      attendanceData.checkTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${attendanceData.checkTime}`;
    }
    // Now it should be a full ISO string
    attendanceData.checkTime = new Date(attendanceData.checkTime).toISOString();
  } else if (attendanceData.checkTime instanceof Date) {
    attendanceData.checkTime = attendanceData.checkTime.toISOString();
  }

  if (!attendanceData.employeeId) {
    return res.status(400).json({ message: 'Employee ID is required' });
  }

  try {
    // Use getBangkokTime() for the check time
    attendanceData.checkTime = getBangkokTime().toISOString();

    const processedAttendance = await retryOperation(
      () => attendanceService.processAttendance(attendanceData),
      3,
    );

    const updatedStatus = await retryOperation(
      () =>
        attendanceService.getLatestAttendanceStatus(attendanceData.employeeId),
      3,
    );

    // Format times in the response
    if (updatedStatus.latestAttendance) {
      updatedStatus.latestAttendance.checkInTime = updatedStatus
        .latestAttendance.checkInTime
        ? formatTime(new Date(updatedStatus.latestAttendance.checkInTime))
        : null;
      updatedStatus.latestAttendance.checkOutTime = updatedStatus
        .latestAttendance.checkOutTime
        ? formatTime(new Date(updatedStatus.latestAttendance.checkOutTime))
        : null;
    }

    // Send notification asynchronously
    sendNotificationAsync(attendanceData, updatedStatus);

    res.status(200).json(updatedStatus);
  } catch (error: any) {
    errorLogger.log(error);

    if (error instanceof PrismaClientValidationError) {
      res.status(400).json({ message: 'Invalid input data' });
    } else if (error.code === 'P2002') {
      res.status(409).json({ message: 'Attendance record already exists' });
    } else {
      res.status(500).json({ message: 'Internal server error' });
    }
  }
}

async function sendNotificationAsync(
  attendanceData: AttendanceData,
  updatedStatus: AttendanceStatusInfo,
) {
  try {
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
  } catch (error: any) {
    console.error('Failed to send notification:', error);
    errorLogger.log(error);
    // Consider implementing a retry mechanism or queueing system for failed notifications
  }
}

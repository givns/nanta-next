// pages/api/check-in-out.ts

import { PrismaClient, User } from '@prisma/client';
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
  formatTime,
  formatDate,
  getCurrentTime,
  formatDateTime,
} from '@/utils/dateUtils';
import * as Yup from 'yup';
import { RateLimiter } from 'limiter';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';

const limiter = new RateLimiter({ tokensPerInterval: 5, interval: 'minute' });

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const notificationService = new NotificationService();
const overtimeNotificationService = new OvertimeNotificationService();

const shiftService = new ShiftManagementService(prisma);

const timeEntryService = new TimeEntryService(prisma, shiftService);

const overtimeService = new OvertimeServiceServer(
  prisma,
  overtimeNotificationService,
  timeEntryService,
);

shiftService.setOvertimeService(overtimeService);

const attendanceService = new AttendanceService(
  prisma,
  shiftService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
  timeEntryService,
);

const attendanceSchema = Yup.object()
  .shape({
    employeeId: Yup.string(),
    lineUserId: Yup.string(),
    isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
    checkTime: Yup.date().optional(),
    location: Yup.string().optional(),
    checkInAddress: Yup.string().optional(), // Make checkInAddress optional
    checkOutAddress: Yup.string().optional(),
    reason: Yup.string(),
    isOvertime: Yup.boolean().optional(), // Changed to optional
    isLate: Yup.boolean().optional(),
  })
  .test(
    'either-employeeId-or-lineUserId',
    'Either employeeId or lineUserId must be provided',
    function (value) {
      return !!value.employeeId || !!value.lineUserId;
    },
  );

const checkInOutQueue = new BetterQueue(
  async (task, cb) => {
    try {
      const result = await processCheckInOut(task);
      cb(null, result);
    } catch (error) {
      cb(error);
    }
  },
  {
    concurrent: 5,
    store: new MemoryStore(),
  },
);

async function processCheckInOut(data: any) {
  console.log('Processing check-in/out data:', data);

  const validatedData = await attendanceSchema.validate(data);

  let employeeId: string;
  let user: User | null = null;

  if (validatedData.employeeId) {
    employeeId = validatedData.employeeId;
    user = await prisma.user.findUnique({
      where: { employeeId },
    });
  } else if (validatedData.lineUserId) {
    user = await prisma.user.findUnique({
      where: { lineUserId: validatedData.lineUserId },
    });
    if (user) {
      employeeId = user.employeeId;
    } else {
      throw new Error('User not found for the given Line User ID');
    }
  } else {
    throw new Error('Either employeeId or lineUserId must be provided');
  }

  if (!user) {
    throw new Error('User not found');
  }

  const now = getCurrentTime();

  const attendanceData: AttendanceData = {
    employeeId,
    lineUserId: user.lineUserId,
    isCheckIn: validatedData.isCheckIn,
    checkTime: validatedData.checkTime || now.toISOString(),
    location: validatedData.location || '',
    [validatedData.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
      validatedData.isCheckIn
        ? validatedData.checkInAddress || user.departmentName || ''
        : validatedData.checkOutAddress || user.departmentName || '',
    reason: validatedData.reason || '',
    isOvertime: validatedData.isOvertime || false,
    isLate: validatedData.isLate || false,
  };

  await attendanceService.processAttendance(attendanceData);

  const updatedStatus = await attendanceService.getLatestAttendanceStatus(
    attendanceData.employeeId,
  );

  if (updatedStatus.latestAttendance) {
    updatedStatus.latestAttendance.checkInTime = updatedStatus.latestAttendance
      .checkInTime
      ? formatTime(new Date(updatedStatus.latestAttendance.checkInTime))
      : null;
    updatedStatus.latestAttendance.checkOutTime = updatedStatus.latestAttendance
      .checkOutTime
      ? formatTime(new Date(updatedStatus.latestAttendance.checkOutTime))
      : null;
    updatedStatus.latestAttendance.date = formatDate(
      new Date(updatedStatus.latestAttendance.date),
    );
  }

  sendNotificationAsync(attendanceData, updatedStatus).catch(console.error);

  return updatedStatus;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!(await limiter.removeTokens(1))) {
    return res
      .status(429)
      .json({ error: 'Too many requests, please try again later.' });
  }

  try {
    const now = getCurrentTime();
    console.log(
      `Processing check-in/out at: ${formatDateTime(now, 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log('Received data:', JSON.stringify(req.body));

    checkInOutQueue.push(req.body, (err: Error, result: any) => {
      if (err) {
        console.error('Error processing check-in/out:', err);
        console.error('Error stack:', err.stack);
        res.status(500).json({
          error: 'Internal server error',
          details: err.message,
          stack: err.stack,
        });
      } else {
        console.log(
          'Check-in/out processed successfully:',
          JSON.stringify(result),
        );
        res.status(200).json(result);
      }
    });
  } catch (error: any) {
    console.error('Detailed error in check-in-out:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      stack: error.stack,
      receivedData: req.body,
    });
  }
}

async function sendNotificationAsync(
  attendanceData: AttendanceData,
  updatedStatus: AttendanceStatusInfo,
) {
  try {
    const currentTime = getCurrentTime();
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
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

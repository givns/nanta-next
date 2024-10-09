// pages/api/check-in-out.ts

import { PrismaClient, User } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { AttendanceData, AttendanceStatusInfo } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { createNotificationService } from '../../services/NotificationService';
import { createLeaveServiceServer } from '../../services/LeaveServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import {
  formatTime,
  formatDate,
  getCurrentTime,
  formatDateTime,
} from '@/utils/dateUtils';
import * as Yup from 'yup';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
export const notificationService = createNotificationService(prisma);
export const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const shiftService = new ShiftManagementService(prisma);

const timeEntryService = new TimeEntryService(prisma, shiftService);

const overtimeService = new OvertimeServiceServer(
  prisma,
  timeEntryService,
  notificationService,
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

function validateUpdatedStatus(status: any): boolean {
  if (!status || typeof status !== 'object') return false;
  if (!status.latestAttendance || typeof status.latestAttendance !== 'object')
    return false;
  return true;
}

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
  console.log('Starting processCheckInOut with data:', JSON.stringify(data));

  try {
    console.log('Validating data');
    const validatedData = await attendanceSchema.validate(data);
    console.log('Data validated successfully');

    let employeeId: string;
    let user: User | null = null;

    console.log('Finding user');
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
    console.log('User found:', user.employeeId);

    const now = getCurrentTime();
    console.log('Current time:', formatDateTime(now, 'yyyy-MM-dd HH:mm:ss'));

    const attendanceData: AttendanceData = {
      employeeId: validatedData.employeeId ?? '',
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

    console.log('Processing attendance');
    await attendanceService.processAttendance(attendanceData);
    console.log('Attendance processed successfully');

    console.log('Getting latest attendance status');
    const updatedStatus = await attendanceService.getLatestAttendanceStatus(
      attendanceData.employeeId,
    );
    console.log('Raw latest attendance status:', JSON.stringify(updatedStatus));

    if (!validateUpdatedStatus(updatedStatus)) {
      console.error('Invalid updatedStatus:', JSON.stringify(updatedStatus));
      throw new Error('Invalid attendance status format');
    }

    if (updatedStatus.latestAttendance) {
      console.log('Formatting attendance times');
      try {
        if (updatedStatus.latestAttendance.checkInTime) {
          console.log(
            'Raw checkInTime:',
            updatedStatus.latestAttendance.checkInTime,
          );
          const formattedCheckInTime = formatTime(
            updatedStatus.latestAttendance.checkInTime,
          );
          if (formattedCheckInTime === 'Invalid Time') {
            console.error(
              'Invalid checkInTime:',
              updatedStatus.latestAttendance.checkInTime,
            );
            updatedStatus.latestAttendance.checkInTime = null;
          } else {
            updatedStatus.latestAttendance.checkInTime = formattedCheckInTime;
          }
          console.log(
            'Formatted checkInTime:',
            updatedStatus.latestAttendance.checkInTime,
          );
        }
        if (updatedStatus.latestAttendance.checkOutTime) {
          console.log(
            'Raw checkOutTime:',
            updatedStatus.latestAttendance.checkOutTime,
          );
          const formattedCheckOutTime = formatTime(
            updatedStatus.latestAttendance.checkOutTime,
          );
          if (formattedCheckOutTime === 'Invalid Time') {
            console.error(
              'Invalid checkOutTime:',
              updatedStatus.latestAttendance.checkOutTime,
            );
            updatedStatus.latestAttendance.checkOutTime = null;
          } else {
            updatedStatus.latestAttendance.checkOutTime = formattedCheckOutTime;
          }
          console.log(
            'Formatted checkOutTime:',
            updatedStatus.latestAttendance.checkOutTime,
          );
        }
        console.log('Raw date:', updatedStatus.latestAttendance.date);
        updatedStatus.latestAttendance.date = formatDate(
          new Date(updatedStatus.latestAttendance.date),
        );
        console.log('Formatted date:', updatedStatus.latestAttendance.date);
      } catch (formatError: any) {
        console.error('Error formatting attendance times:', formatError);
        console.error('Error details:', formatError.stack);
        updatedStatus.latestAttendance.checkInTime = null;
        updatedStatus.latestAttendance.checkOutTime = null;
      }
    }

    console.log('Formatted updatedStatus:', JSON.stringify(updatedStatus));

    console.log('Sending notification');
    sendNotificationAsync(attendanceData, updatedStatus).catch(console.error);
    console.log('Notification sent');

    console.log('processCheckInOut completed successfully');
    return updatedStatus;
  } catch (error) {
    console.error('Error in processCheckInOut:', error);
    throw error; // Re-throw the error to be caught by the queue
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const now = getCurrentTime();
    console.log(
      `Processing check-in/out at: ${formatDateTime(now, 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log('Received data:', JSON.stringify(req.body));

    // Wrap the queue push in a promise to handle asynchronous errors
    const queueResult = await new Promise((resolve, reject) => {
      checkInOutQueue.push(req.body, (err: Error | null, result: any) => {
        if (err) {
          console.error('Error in queue processing:', err);
          console.error('Error stack:', err.stack);
          reject(err);
        } else {
          console.log('Queue processing completed successfully');
          resolve(result);
        }
      });
    });

    if (!validateUpdatedStatus(queueResult)) {
      throw new Error(
        'Invalid attendance status format returned from processing',
      );
    }

    console.log(
      'Check-in/out processed successfully:',
      JSON.stringify(queueResult),
    );
    res.status(200).json(queueResult);
  } catch (error: any) {
    console.error('Detailed error in check-in-out:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      name: error.name,
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
    console.log(
      `Attempting to send notification for employee ${attendanceData.employeeId}`,
    );
    console.log(`Notification data:`, JSON.stringify(attendanceData));

    if (attendanceData.isCheckIn) {
      if (attendanceData.lineUserId) {
        await notificationService.sendCheckInConfirmation(
          attendanceData.employeeId,
          attendanceData.lineUserId,
          currentTime,
        );
        console.log(
          `Check-in notification sent for employee ${attendanceData.employeeId}`,
        );
      } else {
        console.log('Line user ID is null, skipping check-in notification');
      }
    } else {
      if (attendanceData.lineUserId) {
        await notificationService.sendCheckOutConfirmation(
          attendanceData.employeeId,
          attendanceData.lineUserId,
          currentTime,
        );
        console.log(
          `Check-out notification sent for employee ${attendanceData.employeeId}`,
        );
      } else {
        console.log('Line user ID is null, skipping check-out notification');
      }
    }
  } catch (error: any) {
    console.error('Failed to send notification:', error);
    console.error('Error stack:', error.stack);
  }
}

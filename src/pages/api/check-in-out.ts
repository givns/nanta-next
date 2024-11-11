// pages/api/check-in-out.ts

import { PrismaClient, Prisma } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import {
  AttendanceData,
  AttendanceStatusInfo,
  EarlyCheckoutType,
} from '@/types/attendance';
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
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
export const notificationService = createNotificationService(prisma);
export const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const shiftService = new ShiftManagementService(prisma, holidayService);

const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
);

const overtimeService = new OvertimeServiceServer(
  prisma,
  holidayService,
  leaveServiceServer,
  shiftService,
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

const PROCESS_TIMEOUT = 20000; // 30 seconds total
const QUEUE_TIMEOUT = 15000; // 25 seconds for queue processing

const attendanceSchema = Yup.object()
  .shape({
    employeeId: Yup.string(),
    lineUserId: Yup.string(),
    isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
    checkTime: Yup.date().optional(),
    location: Yup.string().optional(),
    checkInAddress: Yup.string().optional(),
    checkOutAddress: Yup.string().optional(),
    reason: Yup.string(),
    isOvertime: Yup.boolean().optional(),
    isLate: Yup.boolean().optional(),
    isEarlyCheckOut: Yup.boolean().optional(),
    earlyCheckoutType: Yup.string()
      .nullable()
      .oneOf(['emergency', 'planned', null])
      .when('isEarlyCheckOut', {
        is: true,
        then: (schema) =>
          schema
            .required('Early checkout type is required when checking out early')
            .oneOf(['emergency', 'planned']),
        otherwise: (schema) => schema.nullable(),
      }),
    isManualEntry: Yup.boolean().optional(),
  })
  .test(
    'either-employeeId-or-lineUserId',
    'Either employeeId or lineUserId must be provided',
    (value) => Boolean(value.employeeId || value.lineUserId),
  );

interface QueueTask extends AttendanceData {
  inPremises: boolean;
  address: string;
}

const checkInOutQueue = new BetterQueue(
  async (task, cb) => {
    try {
      let isCompleted = false;

      // Create task timeout
      const taskTimeout = setTimeout(() => {
        if (!isCompleted) {
          console.error('Task timeout reached for:', task.employeeId);
          cb(new Error('Task processing timeout'));
        }
      }, QUEUE_TIMEOUT);

      // Process the task
      const result = await processCheckInOut(task);
      isCompleted = true;
      clearTimeout(taskTimeout);

      cb(null, result);
    } catch (error) {
      console.error('Queue task error:', error);
      cb(error);
    }
  },
  {
    concurrent: 3,
    store: new MemoryStore(),
    failTaskOnProcessException: true,
    maxTimeout: QUEUE_TIMEOUT + 2000,
    retryDelay: 2000,
    maxRetries: 1,
  },
);

async function processCheckInOut(
  data: QueueTask,
): Promise<AttendanceStatusInfo> {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Processing timeout')), QUEUE_TIMEOUT);
  });

  try {
    // Race between processing and timeout
    const result = await Promise.race([
      (async () => {
        const validatedData = await attendanceSchema.validate(data);
        const user = validatedData.employeeId
          ? await prisma.user.findUnique({
              where: { employeeId: validatedData.employeeId },
            })
          : await prisma.user.findUnique({
              where: { lineUserId: validatedData.lineUserId },
            });

        if (!user) throw new Error('User not found');

        const now = getCurrentTime();
        const checkTime = validatedData.checkTime
          ? new Date(validatedData.checkTime)
          : now;

        const attendanceData: AttendanceData = {
          employeeId: user.employeeId,
          lineUserId: user.lineUserId,
          isCheckIn: validatedData.isCheckIn,
          checkTime: checkTime.toISOString(), // Use parsed checkTime
          location: validatedData.location || '',
          [validatedData.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
            validatedData.isCheckIn
              ? validatedData.checkInAddress || user.departmentName || ''
              : validatedData.checkOutAddress || user.departmentName || '',
          reason: validatedData.reason || '',
          isOvertime: validatedData.isOvertime || false,
          isLate: validatedData.isLate || false,
          isEarlyCheckOut: validatedData.isEarlyCheckOut || false,
          earlyCheckoutType:
            (validatedData.earlyCheckoutType as EarlyCheckoutType) || undefined,
          isManualEntry: validatedData.isManualEntry || false,
        };

        // Process attendance
        const processedAttendance =
          await attendanceService.processAttendance(attendanceData);
        if (!processedAttendance)
          throw new Error('Failed to process attendance');

        // Get updated status
        const updatedStatus = await attendanceService.getLatestAttendanceStatus(
          attendanceData.employeeId,
        );

        // Handle notifications asynchronously
        if (user.lineUserId) {
          Promise.resolve().then(async () => {
            try {
              // Get the actual check time from the processed attendance record
              const notificationTime = validatedData.isCheckIn
                ? processedAttendance.regularCheckInTime
                : processedAttendance.regularCheckOutTime;

              console.log('Sending notification with check time:', {
                isCheckIn: validatedData.isCheckIn,
                checkTime: checkTime.toISOString(),
                employeeId: user.employeeId,
                lineUserId: user.lineUserId,
              });

              if (user.lineUserId) {
                if (validatedData.isCheckIn) {
                  await notificationService.sendCheckInConfirmation(
                    user.employeeId,
                    user.lineUserId,
                    notificationTime || now,
                  );
                  console.log(
                    'Check-in notification sent to user:',
                    user.employeeId,
                  );
                } else {
                  await notificationService.sendCheckOutConfirmation(
                    user.employeeId,
                    user.lineUserId,
                    notificationTime || now,
                  );
                  console.log(
                    'Check-out notification sent to user:',
                    user.employeeId,
                  );
                }
              }
            } catch (error) {
              console.error('Notification error:', error);
            }
          });
        }

        return updatedStatus;
      })(),
      timeoutPromise,
    ]);

    return result as AttendanceStatusInfo;
  } catch (error) {
    console.error('Error in processCheckInOut:', error);
    throw error;
  }
}

function isAttendanceStatusInfo(value: any): value is AttendanceStatusInfo {
  try {
    if (!value || typeof value !== 'object') {
      console.error('Value is not an object:', value);
      return false;
    }

    // Required properties
    const requiredProps = [
      'latestAttendance',
      'isDayOff',
      'status',
      'isCheckingIn',
    ];

    for (const prop of requiredProps) {
      if (!(prop in value)) {
        console.error(`Missing required property: ${prop}`);
        return false;
      }
    }

    // Validate latestAttendance structure if present
    if (value.latestAttendance !== null) {
      if (typeof value.latestAttendance !== 'object') {
        console.error('latestAttendance is not an object');
        return false;
      }

      const requiredAttendanceProps = ['id', 'employeeId', 'date', 'status'];

      for (const prop of requiredAttendanceProps) {
        if (!(prop in value.latestAttendance)) {
          console.error(
            `Missing required property in latestAttendance: ${prop}`,
          );
          return false;
        }
      }

      // Check types of important properties
      if (typeof value.latestAttendance.employeeId !== 'string') {
        console.error('employeeId is not a string');
        return false;
      }

      // Validate date format
      if (!value.latestAttendance.date) {
        console.error('date is missing');
        return false;
      }
    }

    // Validate boolean properties
    const booleanProps = ['isDayOff', 'isCheckingIn'];
    for (const prop of booleanProps) {
      if (typeof value[prop] !== 'boolean') {
        console.error(`Property ${prop} is not a boolean:`, value[prop]);
        return false;
      }
    }

    // Additional validation for status
    if (typeof value.status !== 'string') {
      console.error('status is not a string:', value.status);
      return false;
    }

    console.log('AttendanceStatusInfo validation passed');
    return true;
  } catch (error) {
    console.error('Error validating AttendanceStatusInfo:', error);
    console.error('Failed value:', JSON.stringify(value, null, 2));
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST method is allowed',
    });
  }

  // Set a shorter timeout
  res.setTimeout(PROCESS_TIMEOUT);

  try {
    const result = await processCheckInOut(req.body);

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error: any) {
    console.error('Handler error:', error);

    if (
      error.message === 'Processing timeout' ||
      error.message === 'Task processing timeout'
    ) {
      return res.status(504).json({
        error: 'Gateway Timeout',
        message:
          'Processing took too long. Please check your attendance status.',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      timestamp: getCurrentTime().toISOString(),
    });
  }
}

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

const PROCESS_TIMEOUT = 25000; // 25 seconds timeout

interface ErrorResponse {
  error: string;
  message?: string;
  details?: string;
  code?: string;
}

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

function validateUpdatedStatus(status: any): boolean {
  if (!status || typeof status !== 'object') return false;
  if (!status.latestAttendance || typeof status.latestAttendance !== 'object')
    return false;
  return true;
}

const checkInOutQueue = new BetterQueue(
  async (task, cb) => {
    try {
      // Set a timeout for the individual task processing
      const taskTimeout = setTimeout(() => {
        cb(new Error('Task processing timeout'));
      }, 20000); // 20 second timeout per task

      const result = await processCheckInOut(task);
      clearTimeout(taskTimeout);
      cb(null, result);
    } catch (error) {
      cb(error);
    }
  },
  {
    concurrent: 5,
    store: new MemoryStore(),
    precondition: async (_cb) => true, // Always allow new tasks
    failTaskOnProcessException: true,
    maxTimeout: 22000, // Slightly longer than individual task timeout
    retryDelay: 1000,
    maxRetries: 2,
  },
);

async function processCheckInOut(
  data: QueueTask,
): Promise<AttendanceStatusInfo> {
  try {
    const validatedData = await attendanceSchema.validate(data);

    const user = validatedData.employeeId
      ? await prisma.user.findUnique({
          where: { employeeId: validatedData.employeeId },
        })
      : await prisma.user.findUnique({
          where: { lineUserId: validatedData.lineUserId },
        });

    if (!user) {
      throw new Error('User not found');
    }

    const now = getCurrentTime();
    const attendanceData: AttendanceData = {
      employeeId: user.employeeId,
      lineUserId: user.lineUserId,
      isCheckIn: validatedData.isCheckIn,
      checkTime: (validatedData.checkTime || now).toISOString(),
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

    // For early check-out, first verify if leave request exists
    if (!validatedData.isCheckIn && validatedData.reason === 'early-checkout') {
      const leaveRequest = await leaveServiceServer.checkUserOnLeave(
        user.employeeId,
        now,
      );
      if (!leaveRequest) {
        throw new Error('No leave request found for early checkout');
      }
    }

    // Process attendance
    const processedAttendance =
      await attendanceService.processAttendance(attendanceData);
    if (!processedAttendance) {
      throw new Error('Failed to process attendance');
    }

    // Get updated status
    const updatedStatus = await attendanceService.getLatestAttendanceStatus(
      attendanceData.employeeId,
    );

    // Format times for response
    if (updatedStatus.latestAttendance) {
      if (updatedStatus.latestAttendance.checkInTime) {
        updatedStatus.latestAttendance.checkInTime = formatTime(
          updatedStatus.latestAttendance.checkInTime,
        );
      }
      if (updatedStatus.latestAttendance.checkOutTime) {
        updatedStatus.latestAttendance.checkOutTime = formatTime(
          updatedStatus.latestAttendance.checkOutTime,
        );
      }
      updatedStatus.latestAttendance.date = formatDate(
        new Date(updatedStatus.latestAttendance.date),
      );
    }

    // Send notification asynchronously
    sendNotificationAsync(attendanceData, updatedStatus).catch(console.error);

    return updatedStatus;
  } catch (error: any) {
    console.error('Error in processCheckInOut:', error);
    throw error;
  }
}

function isAttendanceStatusInfo(value: any): value is AttendanceStatusInfo {
  return (
    value &&
    typeof value === 'object' &&
    'latestAttendance' in value &&
    typeof value.latestAttendance === 'object'
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Set longer timeout
  res.setTimeout(PROCESS_TIMEOUT);

  try {
    const now = getCurrentTime();
    console.log(
      `Processing check-in/out at: ${formatDateTime(now, 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log('Received data:', JSON.stringify(req.body));

    // Create a promise that rejects after timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Processing timeout'));
      }, PROCESS_TIMEOUT - 1000); // Leave 1 second buffer
    });

    // Create the processing promise
    const processPromise = new Promise<AttendanceStatusInfo>(
      (resolve, reject) => {
        checkInOutQueue.push(req.body, (err: Error | null, result: any) => {
          if (err) {
            console.error('Error in queue processing:', err);
            reject(err);
          } else if (!isAttendanceStatusInfo(result)) {
            reject(new Error('Invalid attendance status format'));
          } else {
            resolve(result);
          }
        });
      },
    );

    const queueResult = (await Promise.race([
      processPromise,
      timeoutPromise,
    ])) as AttendanceStatusInfo;

    if (!validateUpdatedStatus(queueResult)) {
      throw new Error(
        'Invalid attendance status format returned from processing',
      );
    }

    // Process notification asynchronously
    const attendanceData: AttendanceData = {
      employeeId: req.body.employeeId,
      lineUserId: req.body.lineUserId,
      isCheckIn: req.body.isCheckIn,
      checkTime: req.body.checkTime,
      location: req.body.location || '',
      reason: req.body.reason || '',
      isOvertime: req.body.isOvertime || false,
      isLate: req.body.isLate || false,
      isEarlyCheckOut: req.body.isEarlyCheckOut || false,
      isManualEntry: req.body.isManualEntry || false,
      ...(req.body.isCheckIn
        ? { checkInAddress: req.body.checkInAddress }
        : { checkOutAddress: req.body.checkOutAddress }),
    };

    // Start notification process but don't await it
    sendNotificationAsync(attendanceData, queueResult).catch((error) => {
      console.error('Async notification error:', error);
    });

    console.log(
      'Check-in/out processed successfully:',
      JSON.stringify(queueResult),
    );
    return res.status(200).json(queueResult);
  } catch (error: any) {
    console.error('Detailed error in check-in-out:', error);

    let errorResponse: ErrorResponse;

    if (error.message === 'Processing timeout') {
      errorResponse = {
        error: 'Gateway Timeout',
        message:
          'Processing took too long, but the operation may have completed successfully. Please check status.',
      };
      return res.status(504).json(errorResponse);
    }

    // Handle Prisma errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorResponse = {
        error: 'Database Error',
        message: 'Failed to process request',
        details: error.message,
        code: error.code,
      };
      return res.status(500).json(errorResponse);
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      errorResponse = {
        error: 'Validation Error',
        message: error.message,
      };
      return res.status(400).json(errorResponse);
    }

    // Handle any other errors
    errorResponse = {
      error: 'Internal server error',
      message: error.message || 'An unexpected error occurred',
      details: error.stack,
    };

    return res.status(500).json(errorResponse);
  }
}

// Update sendNotificationAsync to use a notification queue
interface NotificationQueueTask {
  attendanceData: AttendanceData;
  statusInfo: AttendanceStatusInfo;
  retryCount?: number;
}

const notificationQueue = new BetterQueue<NotificationQueueTask>(
  async (task, cb) => {
    try {
      const { attendanceData, statusInfo, retryCount = 0 } = task;

      if (!attendanceData.lineUserId) {
        console.log('Line user ID is null, skipping notification');
        return cb(null);
      }

      let success = false;

      try {
        if (attendanceData.isCheckIn) {
          await notificationService.sendCheckInConfirmation(
            attendanceData.employeeId,
            attendanceData.lineUserId,
            new Date(attendanceData.checkTime),
          );
        } else {
          await notificationService.sendCheckOutConfirmation(
            attendanceData.employeeId,
            attendanceData.lineUserId,
            new Date(attendanceData.checkTime),
          );
        }
        success = true;
      } catch (error) {
        console.error(
          `Error sending ${attendanceData.isCheckIn ? 'check-in' : 'check-out'} confirmation:`,
          error,
        );

        // Try fallback if first attempt failed
        if (!success) {
          const formattedDateTime = format(
            new Date(attendanceData.checkTime),
            'dd MMMM yyyy เวลา HH:mm น.',
            { locale: th },
          );
          const message = attendanceData.isCheckIn
            ? `${attendanceData.employeeId} ลงเวลาเข้างานเมื่อ ${formattedDateTime}`
            : `${attendanceData.employeeId} ลงเวลาออกงานเมื่อ ${formattedDateTime}`;

          success = await notificationService.sendNotification(
            attendanceData.employeeId,
            attendanceData.lineUserId,
            message,
            attendanceData.isCheckIn ? 'check-in' : 'check-out',
          );
        }
      }

      if (success) {
        console.log(
          `${attendanceData.isCheckIn ? 'Check-in' : 'Check-out'} notification sent for employee ${attendanceData.employeeId}`,
        );
        cb(null);
      } else if (retryCount < 3) {
        // Retry with incremented count
        cb(null, { ...task, retryCount: retryCount + 1 });
      } else {
        cb(new Error('Failed to send notification after retries'));
      }
    } catch (error) {
      cb(error);
    }
  },
  {
    concurrent: 3,
    maxRetries: 3,
    retryDelay: 2000,
  },
);

async function sendNotificationAsync(
  attendanceData: AttendanceData,
  statusInfo: AttendanceStatusInfo,
) {
  return new Promise<void>((resolve, reject) => {
    notificationQueue.push({ attendanceData, statusInfo }, (error) => {
      if (error) {
        console.error('Failed to process notification:', error);
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

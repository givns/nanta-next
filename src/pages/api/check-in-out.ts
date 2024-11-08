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

const PROCESS_TIMEOUT = 30000; // 30 seconds total
const QUEUE_TIMEOUT = 25000; // 25 seconds for queue processing

interface ErrorResponse {
  error: string;
  message?: string;
  details?: string;
  code?: string;
  timestamp: string;
}

interface AttendanceNotificationData {
  regularCheckInTime?: Date | null;
  regularCheckOutTime?: Date | null;
  status: string;
  overtimeMetadata?: {
    isDayOffOvertime?: boolean;
    isInsideShiftHours?: boolean;
    startTime?: string;
    endTime?: string;
  };
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
  try {
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

    // Verify leave request for early check-out
    if (!validatedData.isCheckIn && validatedData.reason === 'early-checkout') {
      const leaveRequest = await leaveServiceServer.checkUserOnLeave(
        user.employeeId,
        now,
      );
      if (!leaveRequest)
        throw new Error('No leave request found for early checkout');
    }

    // Process attendance
    const processedAttendance =
      await attendanceService.processAttendance(attendanceData);
    if (!processedAttendance) throw new Error('Failed to process attendance');

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

    // Fire and forget notifications
    if (user.lineUserId && processedAttendance) {
      try {
        const notificationData = {
          regularCheckInTime: (processedAttendance as any).regularCheckInTime,
          regularCheckOutTime: (processedAttendance as any).regularCheckOutTime,
          status: processedAttendance.status,
          overtimeMetadata: (processedAttendance as any).overtimeMetadata,
        } as AttendanceNotificationData;

        console.log('Sending notification for user:', {
          employeeId: user.employeeId,
          lineUserId: user.lineUserId,
          checkInTime: notificationData.regularCheckInTime,
          checkOutTime: notificationData.regularCheckOutTime,
        });

        if (notificationData.regularCheckInTime) {
          await notificationService.sendCheckInConfirmation(
            user.employeeId,
            user.lineUserId,
            new Date(notificationData.regularCheckInTime),
          );
          console.log(
            'Check-in notification sent successfully to user:',
            user.employeeId,
          );
        } else if (notificationData.regularCheckOutTime) {
          await notificationService.sendCheckOutConfirmation(
            user.employeeId,
            user.lineUserId,
            new Date(notificationData.regularCheckOutTime),
          );
          console.log(
            'Check-out notification sent successfully to user:',
            user.employeeId,
          );
        }
      } catch (notificationError) {
        console.error('Error sending notification to user:', {
          employeeId: user.employeeId,
          error: notificationError,
        });
        // Do not rethrow to allow main process continuation
      }
    } else {
      console.warn(
        `No LINE User ID found for employee ${user.employeeId} or no processed attendance`,
      );
    }

    return updatedStatus;
  } catch (error: any) {
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

  // Set longer timeout
  res.setTimeout(PROCESS_TIMEOUT);

  const now = getCurrentTime();
  console.log(
    `Processing check-in/out at: ${formatDateTime(now, 'yyyy-MM-dd HH:mm:ss')}`,
  );
  console.log('Received data:', JSON.stringify(req.body));

  // Validate incoming request data
  try {
    await attendanceSchema.validate(req.body);
  } catch (error: any) {
    console.error('Request validation failed:', error);
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      details: error.errors,
    });
  }

  // Single timeout promise for the entire process
  const processPromise = new Promise<AttendanceStatusInfo>(
    (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('API timeout'));
      }, PROCESS_TIMEOUT - 1000);

      checkInOutQueue.push(req.body, (err: Error | null, result: any) => {
        clearTimeout(timeoutId);

        if (err) {
          console.error('Queue error:', err);
          reject(err);
        } else if (!isAttendanceStatusInfo(result)) {
          console.error(
            'Invalid result format:',
            JSON.stringify(result, null, 2),
          );
          reject(new Error('Invalid result format'));
        } else {
          resolve(result);
        }
      });
    },
  );

  try {
    const result = await processPromise;

    if (!isAttendanceStatusInfo(result)) {
      const error = new Error('Invalid attendance status format');
      error.name = 'ValidationError';
      (error as any).data = result;
      throw error;
    }

    // Log success before sending response
    console.log(
      'Check-in/out processed successfully for:',
      req.body.employeeId,
    );

    return res.status(200).json({
      success: true,
      data: result,
      timestamp: now.toISOString(),
    });
  } catch (error: any) {
    console.error('Detailed error in check-in-out:', {
      error: error.message,
      stack: error.stack,
      data: error.data,
      name: error.name,
    });

    let errorResponse: ErrorResponse;

    if (
      error.message === 'API timeout' ||
      error.message === 'Task processing timeout'
    ) {
      errorResponse = {
        error: 'Gateway Timeout',
        message:
          'Processing took too long. Please check your attendance status.',
        timestamp: now.toISOString(),
      };
      return res.status(504).json(errorResponse);
    }

    if (error.name === 'ValidationError') {
      errorResponse = {
        error: 'Invalid Response Format',
        message: 'The server returned an invalid response format',
        details: error.data ? JSON.stringify(error.data, null, 2) : undefined,
        timestamp: now.toISOString(),
      };
      return res.status(500).json(errorResponse);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      errorResponse = {
        error: 'Database Error',
        message: 'Failed to process request',
        details: error.message,
        code: error.code,
        timestamp: now.toISOString(),
      };
      return res.status(500).json(errorResponse);
    }

    errorResponse = {
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      details:
        typeof error === 'object'
          ? JSON.stringify(error, null, 2)
          : String(error),
      timestamp: now.toISOString(),
    };

    return res.status(500).json(errorResponse);
  }
}

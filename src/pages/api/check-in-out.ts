import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '@/services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import {
  AttendanceData,
  AttendanceStatusInfo,
  EarlyCheckoutType,
} from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { getCurrentTime } from '@/utils/dateUtils';
import * as Yup from 'yup';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';

// Constants
const PROCESS_TIMEOUT = 30000; // 30 seconds total
const QUEUE_TIMEOUT = 25000; // 25 seconds for queue processing
const MAX_RETRIES = 2;
const RETRY_DELAY = 2000;

// Initialize Services
const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const leaveServiceServer = createLeaveServiceServer(
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

// Validation Schema
const attendanceSchema = Yup.object().shape({
  data: Yup.object()
    .shape({
      employeeId: Yup.string(),
      lineUserId: Yup.string(),
      isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
      checkTime: Yup.string().optional(),
      location: Yup.string().optional(),
      checkInAddress: Yup.string().optional(),
      checkOutAddress: Yup.string().optional(),
      reason: Yup.string().default(''),
      isOvertime: Yup.boolean().optional().default(false),
      isLate: Yup.boolean().optional().default(false),
      isEarlyCheckOut: Yup.boolean().optional().default(false),
      earlyCheckoutType: Yup.string()
        .nullable()
        .oneOf(['emergency', 'planned', null])
        .when('isEarlyCheckOut', {
          is: true,
          then: (schema) => schema.required().oneOf(['emergency', 'planned']),
          otherwise: (schema) => schema.nullable(),
        }),
      isManualEntry: Yup.boolean().optional().default(false),
    })
    .test(
      'either-employeeId-or-lineUserId',
      'Either employeeId or lineUserId must be provided',
      (value) => Boolean(value?.employeeId || value?.lineUserId),
    ),
  inPremises: Yup.boolean().required(),
  address: Yup.string().required(),
});

// Queue Types
interface QueueTask {
  data: AttendanceData;
  inPremises: boolean;
  address: string;
}

interface QueueResult {
  status: AttendanceStatusInfo;
  notificationSent: boolean;
}

// Initialize Queue
const checkInOutQueue = new BetterQueue<QueueTask, QueueResult>(
  async (task, cb) => {
    try {
      const result = await processCheckInOut(task);
      cb(null, result);
    } catch (error) {
      console.error('Queue task error:', error);
      cb(error as Error);
    }
  },
  {
    concurrent: 3,
    store: new MemoryStore(),
    maxTimeout: QUEUE_TIMEOUT,
    retryDelay: RETRY_DELAY,
    maxRetries: MAX_RETRIES,
  },
);

// Processing Functions
async function processCheckInOut(task: QueueTask): Promise<QueueResult> {
  console.log('Processing check-in/out task:', task);

  try {
    // Validate input
    const validatedData = await attendanceSchema.validate(task);

    // Get user
    const user = validatedData.data.employeeId
      ? await prisma.user.findUnique({
          where: { employeeId: validatedData.data.employeeId },
        })
      : await prisma.user.findUnique({
          where: { lineUserId: validatedData.data.lineUserId },
        });

    if (!user) throw new Error('User not found');

    const now = getCurrentTime();
    const checkTime = validatedData.data.checkTime
      ? new Date(validatedData.data.checkTime)
      : now;

    // Prepare attendance data
    const attendanceData: AttendanceData = {
      employeeId: user.employeeId,
      lineUserId: user.lineUserId,
      isCheckIn: validatedData.data.isCheckIn,
      checkTime: checkTime.toISOString(),
      location: validatedData.data.location || '',
      [validatedData.data.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
        validatedData.data.isCheckIn
          ? validatedData.data.checkInAddress || validatedData.address
          : validatedData.data.checkOutAddress || validatedData.address,
      reason: validatedData.data.reason || '',
      isOvertime: validatedData.data.isOvertime || false,
      isLate: validatedData.data.isLate || false,
      isEarlyCheckOut: validatedData.data.isEarlyCheckOut || false,
      earlyCheckoutType: validatedData.data.earlyCheckoutType as
        | EarlyCheckoutType
        | undefined,
      isManualEntry: validatedData.data.isManualEntry || false,
    };

    // Process attendance
    const processedAttendance =
      await attendanceService.processAttendance(attendanceData);
    if (!processedAttendance) throw new Error('Failed to process attendance');

    // Get updated status
    const updatedStatus = await attendanceService.getLatestAttendanceStatus(
      attendanceData.employeeId,
    );

    // Send notification asynchronously
    let notificationSent = false;
    if (user.lineUserId) {
      try {
        const notificationTime = validatedData.data.isCheckIn
          ? processedAttendance.regularCheckInTime
          : processedAttendance.regularCheckOutTime;

        if (validatedData.data.isCheckIn) {
          await notificationService.sendCheckInConfirmation(
            user.employeeId,
            user.lineUserId,
            notificationTime || now,
          );
        } else {
          await notificationService.sendCheckOutConfirmation(
            user.employeeId,
            user.lineUserId,
            notificationTime || now,
          );
        }
        notificationSent = true;
      } catch (error) {
        console.error('Notification error:', error);
        // Don't throw - notifications shouldn't fail the whole process
      }
    }

    return {
      status: updatedStatus,
      notificationSent,
    };
  } catch (error) {
    console.error('Error in processCheckInOut:', error);
    throw error;
  }
}

// API Handler
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

  try {
    console.log('Received request body:', req.body);

    const task: QueueTask = req.body;

    // Add to queue and wait for result
    const result = await new Promise<QueueResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Processing timeout'));
      }, PROCESS_TIMEOUT);

      checkInOutQueue.push(task, (error, result) => {
        clearTimeout(timeoutId);
        if (error) reject(error);
        else resolve(result);
      });
    });

    return res.status(200).json({
      success: true,
      data: result.status,
      notificationSent: result.notificationSent,
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error: any) {
    console.error('Handler error:', error);

    if (error.message === 'Processing timeout') {
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

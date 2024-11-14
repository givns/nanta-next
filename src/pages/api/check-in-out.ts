import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '@/services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { AttendanceData, AttendanceStatusInfo } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { getCurrentTime } from '@/utils/dateUtils';
import { z } from 'zod';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';

// Constants
const PROCESS_TIMEOUT = 45000;
const QUEUE_TIMEOUT = 40000;
const RETRY_DELAY = 2000;
const MAX_RETRIES = 0;
const CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Initialize Services with connection pooling
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

// Caching
const userCache = new Map<string, { data: any; timestamp: number }>();
const processedRequests = new Map<
  string,
  { timestamp: number; status: AttendanceStatusInfo }
>();

// Cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of processedRequests.entries()) {
    if (now - data.timestamp > CACHE_TIMEOUT) {
      processedRequests.delete(key);
    }
  }
  for (const [key, data] of userCache.entries()) {
    if (now - data.timestamp > CACHE_TIMEOUT) {
      userCache.delete(key);
    }
  }
}, CACHE_TIMEOUT);

// Validation Schema
const checkInOutSchema = z
  .object({
    data: z
      .object({
        isManualEntry: z.boolean().default(false),
        isEarlyCheckOut: z.boolean().default(false),
        isLate: z.boolean().default(false),
        isOvertime: z.boolean().default(false),
        reason: z.string().default(''),
      })
      .default({}),
    employeeId: z.string().optional(),
    lineUserId: z.string().optional(),
    isCheckIn: z.boolean(),
    checkTime: z.string(),
    checkInAddress: z.string().optional(),
    checkOutAddress: z.string().optional(),
    reason: z.string().optional(),
    photo: z.string().optional(),
    inPremises: z.boolean(),
    address: z.string(),
    earlyCheckoutType: z.enum(['emergency', 'planned'] as const).optional(),
  })
  .refine((data) => Boolean(data.employeeId || data.lineUserId), {
    message: 'Either employeeId or lineUserId must be provided',
    path: ['identification'],
  });

// Types
type CheckInOutRequest = z.infer<typeof checkInOutSchema>;

interface QueueResult {
  status: AttendanceStatusInfo;
  notificationSent: boolean;
  success: boolean;
}

// Helper Functions
async function getCachedUser(identifier: {
  employeeId?: string;
  lineUserId?: string;
}) {
  const key = identifier.employeeId || identifier.lineUserId;
  if (!key) return null;

  const cached = userCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TIMEOUT) {
    return cached.data;
  }

  const user = await prisma.user.findUnique({
    where: identifier.employeeId
      ? { employeeId: identifier.employeeId }
      : { lineUserId: identifier.lineUserId },
  });

  if (user) {
    userCache.set(key, {
      data: user,
      timestamp: Date.now(),
    });
  }

  return user;
}

function getRequestKey(task: CheckInOutRequest): string {
  return `${task.employeeId || task.lineUserId}-${task.checkTime}`;
}

function transformToAttendanceData(
  validatedData: CheckInOutRequest,
  user: { employeeId: string; lineUserId: string | null },
): AttendanceData {
  return {
    employeeId: user.employeeId,
    lineUserId: user.lineUserId,
    isCheckIn: validatedData.isCheckIn,
    checkTime: new Date(validatedData.checkTime).toISOString(),
    location: '',
    [validatedData.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
      validatedData.isCheckIn
        ? validatedData.checkInAddress || validatedData.address
        : validatedData.checkOutAddress || validatedData.address,
    reason: validatedData.data.reason || validatedData.reason || '',
    isOvertime: validatedData.data.isOvertime,
    isLate: validatedData.data.isLate,
    isEarlyCheckOut: validatedData.data.isEarlyCheckOut,
    earlyCheckoutType: validatedData.earlyCheckoutType,
    isManualEntry: validatedData.data.isManualEntry,
  };
}

// Queue setup
const checkInOutQueue = new BetterQueue<CheckInOutRequest, QueueResult>(
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
    concurrent: 1,
    store: new MemoryStore(),
    maxTimeout: QUEUE_TIMEOUT,
    retryDelay: RETRY_DELAY,
    maxRetries: MAX_RETRIES,
    // Fixed precondition typing
    precondition: (cb) => {
      cb(null, true);
    },
  },
);

// Main Processing Function
async function processCheckInOut(
  task: CheckInOutRequest,
): Promise<QueueResult> {
  const requestKey = getRequestKey(task);
  console.log('Processing check-in/out task:', { requestKey, task });

  const existingResult = processedRequests.get(requestKey);
  if (existingResult) {
    console.log('Request already processed:', requestKey);
    return {
      status: existingResult.status,
      notificationSent: false,
      success: true,
    };
  }

  try {
    const [validatedData, user] = await Promise.all([
      Promise.resolve(checkInOutSchema.parse(task)),
      getCachedUser({
        employeeId: task.employeeId,
        lineUserId: task.lineUserId,
      }),
    ]);

    if (!user) throw new Error('User not found');

    const now = getCurrentTime();
    const attendanceData = transformToAttendanceData(validatedData, user);

    try {
      const [processedAttendance, updatedStatus] = await Promise.all([
        attendanceService.processAttendance(attendanceData),
        attendanceService.getLatestAttendanceStatus(user.employeeId),
      ]);

      if (!processedAttendance) {
        throw new Error('Failed to process attendance');
      }

      processedRequests.set(requestKey, {
        timestamp: Date.now(),
        status: updatedStatus,
      });

      let notificationSent = false;
      if (user.lineUserId) {
        const notificationTime = validatedData.isCheckIn
          ? processedAttendance.regularCheckInTime
          : processedAttendance.regularCheckOutTime;

        // Fire and forget notifications
        notificationService[
          validatedData.isCheckIn
            ? 'sendCheckInConfirmation'
            : 'sendCheckOutConfirmation'
        ](user.employeeId, user.lineUserId, notificationTime || now)
          .then(() => {
            notificationSent = true;
          })
          .catch(console.error);
      }

      return {
        status: updatedStatus,
        notificationSent,
        success: true,
      };
    } catch (error: any) {
      if (error.message?.includes('Already checked in')) {
        const currentStatus = await attendanceService.getLatestAttendanceStatus(
          user.employeeId,
        );
        return {
          status: currentStatus,
          notificationSent: false,
          success: true,
        };
      }
      throw error;
    }
  } catch (error: any) {
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

    const result = await Promise.race<QueueResult>([
      new Promise<QueueResult>((resolve, reject) => {
        checkInOutQueue.push(
          req.body,
          (error: Error | null, queueResult?: QueueResult) => {
            if (error) reject(error);
            else if (queueResult) resolve(queueResult);
            else reject(new Error('No result returned from queue'));
          },
        );
      }),
      new Promise<QueueResult>((_, reject) =>
        setTimeout(
          () => reject(new Error('Processing timeout')),
          PROCESS_TIMEOUT,
        ),
      ),
    ]);

    return res.status(200).json({
      success: true,
      data: result.status,
      notificationSent: result.notificationSent,
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error: any) {
    console.error('Handler error:', error);

    if (
      error.message === 'Processing timeout' ||
      error.message?.includes('timeout')
    ) {
      try {
        const user = req.body.employeeId
          ? await prisma.user.findUnique({
              where: { employeeId: req.body.employeeId },
            })
          : await prisma.user.findUnique({
              where: { lineUserId: req.body.lineUserId },
            });

        if (user) {
          const currentStatus =
            await attendanceService.getLatestAttendanceStatus(user.employeeId);
          if (currentStatus) {
            return res.status(200).json({
              success: true,
              data: currentStatus,
              notificationSent: false,
              message: 'Request processing continued in background',
              timestamp: getCurrentTime().toISOString(),
            });
          }
        }
      } catch (statusError) {
        console.error('Error getting status after timeout:', statusError);
      }

      return res.status(504).json({
        error: 'Gateway Timeout',
        message:
          'Processing took too long. Please check your attendance status.',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors,
        timestamp: getCurrentTime().toISOString(),
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      timestamp: getCurrentTime().toISOString(),
    });
  } finally {
    try {
      await prisma.$disconnect();
    } catch (error) {
      console.error('Error disconnecting from database:', error);
    }
  }
}

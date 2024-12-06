import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { initializeServices } from '../../../services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { ProcessingOptions } from '@/types/attendance/processing';
import { CACHE_CONSTANTS } from '@/types/attendance/base';
import { getCurrentTime } from '@/utils/dateUtils';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';
import { AttendanceStatusInfo } from '@/types/attendance/status';
import { validateCheckInOutRequest } from '@/schemas/attendance';

// Initialize main service
const prisma = new PrismaClient();
const services = initializeServices(prisma);
const attendanceService = new AttendanceService(
  prisma,
  services.shiftService,
  services.holidayService,
  services.leaveService,
  services.overtimeService,
  services.notificationService,
  services.timeEntryService,
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
    if (now - data.timestamp > CACHE_CONSTANTS.CACHE_TIMEOUT) {
      processedRequests.delete(key);
    }
  }
  for (const [key, data] of userCache.entries()) {
    if (now - data.timestamp > CACHE_CONSTANTS.CACHE_TIMEOUT) {
      userCache.delete(key);
    }
  }
}, CACHE_CONSTANTS.CACHE_TIMEOUT);

// types
interface QueueResult {
  status: AttendanceStatusInfo;
  notificationSent: boolean;
  success: boolean;
}

// Helper Functions
function getRequestKey(task: ProcessingOptions): string {
  return `${task.employeeId || task.lineUserId}-${task.checkTime}`;
}
async function getCachedUser(identifier: {
  employeeId?: string;
  lineUserId?: string;
}) {
  const key = identifier.employeeId || identifier.lineUserId;
  if (!key) return null;

  const cached = userCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_CONSTANTS.CACHE_TIMEOUT) {
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

// Queue setup
const checkInOutQueue = new BetterQueue<ProcessingOptions, QueueResult>(
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
    maxTimeout: CACHE_CONSTANTS.QUEUE_TIMEOUT,
    retryDelay: CACHE_CONSTANTS.RETRY_DELAY,
    maxRetries: CACHE_CONSTANTS.MAX_RETRIES,
    precondition: (cb) => {
      cb(null, true);
    },
  },
);

// Main Processing Function
async function processCheckInOut(
  task: ProcessingOptions,
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

  const serverTime = getCurrentTime();

  try {
    // Process attendance first
    const [processedAttendance, updatedStatus] = await Promise.all([
      attendanceService.processAttendance({
        ...task,
        checkTime: serverTime.toISOString(), // Use server time
      }),
      attendanceService.getLatestAttendanceStatus(task.employeeId!),
    ]);

    if (!processedAttendance.success) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: 'Failed to process attendance',
      });
    }

    // Cache the result
    processedRequests.set(requestKey, {
      timestamp: Date.now(),
      status: updatedStatus,
    });

    // Handle all notifications here, after successful processing
    let notificationSent = false;
    if (task.lineUserId) {
      try {
        await Promise.allSettled([
          // Base check-in/out notification
          services.notificationService[
            task.isCheckIn
              ? 'sendCheckInConfirmation'
              : 'sendCheckOutConfirmation'
          ](task.employeeId, task.lineUserId, serverTime),
        ]);
        notificationSent = true;
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
        // Don't fail the request if notifications fail
      }
    }

    return {
      status: updatedStatus,
      notificationSent,
      success: true,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Error in processCheckInOut:', error);
    throw new AppError({
      code: ErrorCode.PROCESSING_ERROR,
      message: error instanceof Error ? error.message : 'Processing failed',
      originalError: error,
    });
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

    // Validate request data
    const validatedData = validateCheckInOutRequest(req.body);

    // Process through queue with timeout
    const result = await Promise.race<QueueResult>([
      new Promise<QueueResult>((resolve, reject) => {
        checkInOutQueue.push(validatedData, (error, queueResult) => {
          if (error) reject(error);
          else if (queueResult) resolve(queueResult);
          else reject(new Error('No result returned from queue'));
        });
      }),
      new Promise<QueueResult>((_, reject) =>
        setTimeout(
          () => reject(new Error('Processing timeout')),
          CACHE_CONSTANTS.PROCESS_TIMEOUT,
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

    // Handle timeout cases
    if (
      error.message === 'Processing timeout' ||
      error.message?.includes('timeout')
    ) {
      try {
        const user = await prisma.user.findUnique({
          where: req.body.employeeId
            ? { employeeId: req.body.employeeId }
            : { lineUserId: req.body.lineUserId },
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
        error: ErrorCode.TIMEOUT,
        message:
          'Processing took too long. Please check your attendance status.',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    // Handle validation errors
    if (error instanceof AppError && error.code === ErrorCode.INVALID_INPUT) {
      return res.status(400).json({
        error: error.code,
        message: error.message,
        details: error.details,
        timestamp: getCurrentTime().toISOString(),
      });
    }

    // Handle other errors
    console.error('Handler error:', error);
    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message:
        error instanceof Error ? error.message : 'An unexpected error occurred',
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

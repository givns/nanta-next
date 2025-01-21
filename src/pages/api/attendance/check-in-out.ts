// pages/api/attendance/check-in-out.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PeriodType, PrismaClient, TimeEntryStatus } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { ProcessingOptions } from '@/types/attendance/processing';
import { CACHE_CONSTANTS } from '@/types/attendance/base';
import { getCurrentTime } from '@/utils/dateUtils';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';
import { validateCheckInOutRequest } from '@/schemas/attendance';
import { AttendanceStateResponse, TimeEntry } from '@/types/attendance';
import { parseISO } from 'date-fns';

// Initialize Prisma client
const prisma = new PrismaClient();

// Define the services type
type InitializedServices = Awaited<ReturnType<typeof initializeServices>>;

// Cache the services initialization promise
let servicesPromise: Promise<InitializedServices> | null = null;

// Initialize services once
const getServices = async (): Promise<InitializedServices> => {
  if (!servicesPromise) {
    servicesPromise = initializeServices(prisma);
  }

  const services = await servicesPromise;
  if (!services) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Failed to initialize services',
    });
  }

  return services;
};

// Initialize services at startup
let services: InitializedServices;
getServices()
  .then((s) => {
    services = s;
  })
  .catch((error) => {
    console.error('Failed to initialize services:', error);
    process.exit(1); // Exit if services can't be initialized
  });

// Updated QueueResult interface
interface QueueResult {
  status: AttendanceStateResponse;
  notificationSent: boolean;
  message?: string;
  success: boolean;
  autoCompletedEntries?: {
    regular?: TimeEntry;
    overtime?: TimeEntry[];
  };
}

interface CachedUserData {
  employeeId: string;
  lineUserId?: string | null; // Allow null
}

// Caching setup with typed data
const userCache = new Map<
  string,
  {
    data: CachedUserData;
    timestamp: number;
  }
>();

const processedRequests = new Map<
  string,
  { timestamp: number; status: AttendanceStateResponse }
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
  if (!services) {
    throw new AppError({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Services not initialized',
    });
  }

  const { attendanceService, notificationService } = services;
  const requestKey = getRequestKey(task);
  const serverTime = getCurrentTime();

  console.log('Processing check-in/out task:', {
    requestKey,
    serverTime: serverTime.toISOString(),
    clientTime: task.checkTime,
  });

  // Check cache first
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
    // Get current status first to check if auto-completion needed
    const currentStatus = await attendanceService.getAttendanceStatus(
      task.employeeId!,
      {
        inPremises: true,
        address: task.location?.address || '',
        periodType: task.periodType,
      },
    );

    // Check if auto-completion needed based on current status
    const activeAttendance = currentStatus.base.latestAttendance;
    const needsAutoCompletion =
      // Case 1: Attempting checkout without check-in
      (!activeAttendance?.CheckInTime && !task.activity.isCheckIn) ||
      // Case 2: Regular check-in with incomplete overtime that has ended
      (task.periodType === PeriodType.REGULAR &&
        task.activity.isCheckIn &&
        activeAttendance?.type === PeriodType.OVERTIME &&
        !activeAttendance.CheckOutTime &&
        activeAttendance.shiftEndTime &&
        serverTime > parseISO(activeAttendance.shiftEndTime));

    if (needsAutoCompletion) {
      console.log('Auto-completion needed:', {
        noCheckIn: !activeAttendance?.CheckInTime,
        isCheckingIn: task.activity.isCheckIn,
        activeType: activeAttendance?.type,
        hasCheckOut: Boolean(activeAttendance?.CheckOutTime),
        overtimeEnd: activeAttendance?.shiftEndTime,
      });
    } else {
      console.log('Regular processing:', {
        type: task.periodType,
        isCheckIn: task.activity.isCheckIn,
        isOvertime: task.periodType === PeriodType.OVERTIME,
      });
    }

    // Process attendance with correct flags
    const [processedAttendance, updatedStatus] = await Promise.all([
      attendanceService.processAttendance({
        ...task,
        checkTime: serverTime.toISOString(),
        activity: {
          ...task.activity,
          isOvertime: task.periodType === PeriodType.OVERTIME,
          overtimeMissed: Boolean(needsAutoCompletion), // Force boolean type
        },
      }),
      attendanceService.getAttendanceStatus(task.employeeId!, {
        inPremises: true,
        address: task.location?.address || '',
        periodType: task.periodType,
      }),
    ]);

    // Rest of the function remains the same...
    if (!processedAttendance.success) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: 'Failed to process attendance',
      });
    }

    // Cache handling
    processedRequests.set(requestKey, {
      timestamp: Date.now(),
      status: updatedStatus,
    });

    // Handle notifications
    let notificationSent = false;
    if (task.lineUserId) {
      try {
        await Promise.allSettled([
          notificationService[
            task.activity.isCheckIn
              ? 'sendCheckInConfirmation'
              : 'sendCheckOutConfirmation'
          ](task.employeeId, task.lineUserId, serverTime),
        ]);
        notificationSent = true;
      } catch (notificationError) {
        console.error('Notification error:', notificationError);
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
    console.log('Incoming request body:', JSON.stringify(req.body, null, 2));
    const validatedData = validateCheckInOutRequest(req.body);

    const result = await Promise.race<QueueResult>([
      new Promise<QueueResult>((resolve, reject) => {
        checkInOutQueue.push(validatedData, async (error, queueResult) => {
          if (error) reject(error);
          else if (queueResult) {
            console.log('Initial queue result:', {
              status: queueResult.status.base.state,
              checkStatus: queueResult.status.base.checkStatus,
              requiresAutoComplete:
                queueResult.status.validation.flags.requiresAutoCompletion,
              currentAttendance: queueResult.status.base.latestAttendance
                ? {
                    type: queueResult.status.base.latestAttendance.type,
                    checkIn:
                      queueResult.status.base.latestAttendance.CheckInTime,
                    checkOut:
                      queueResult.status.base.latestAttendance.CheckOutTime,
                  }
                : null,
            });

            // Case 1: Checking out without check-in
            if (
              !queueResult.status.base.latestAttendance?.CheckInTime &&
              !validatedData.activity.isCheckIn
            ) {
              console.log('Auto-completion: Missing check-in for checkout');
              // Let processAttendance handle this through auto-completion
              resolve(queueResult);
              return;
            }

            // Case 2: Checking in regular shift with incomplete overtime
            if (
              validatedData.periodType === PeriodType.REGULAR &&
              validatedData.activity.isCheckIn &&
              queueResult.status.base.latestAttendance?.type ===
                PeriodType.OVERTIME &&
              !queueResult.status.base.latestAttendance.CheckOutTime
            ) {
              console.log(
                'Auto-completion: Missing overtime checkout before regular check-in',
              );
              // Let processAttendance handle the overtime completion
              resolve(queueResult);
              return;
            }

            // Case 3: Normal check-in/out, not auto-completion
            // This includes late overtime checkout - should go through normal processing
            if (
              validatedData.periodType === PeriodType.OVERTIME &&
              !validatedData.activity.isCheckIn
            ) {
              console.log(
                'Normal overtime checkout - no auto-completion needed',
              );
            }

            resolve(queueResult);
          } else {
            reject(new Error('No result returned from queue'));
          }
        });
      }),
      new Promise<QueueResult>((_, reject) =>
        setTimeout(
          () => reject(new Error('Processing timeout')),
          CACHE_CONSTANTS.PROCESS_TIMEOUT,
        ),
      ),
    ]);

    if (!result.success) {
      throw new Error('Failed to process attendance');
    }

    // Always let processAttendance handle the actual processing
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
        const user = await getCachedUser({
          employeeId: req.body.employeeId,
          lineUserId: req.body.lineUserId,
        });

        if (user) {
          const currentStatus =
            await services.attendanceService.getAttendanceStatus(
              user.employeeId,
              {
                inPremises: true,
                address: '',
              },
            );

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
    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message:
        error instanceof Error ? error.message : 'An unexpected error occurred',
      timestamp: getCurrentTime().toISOString(),
    });
  } finally {
    await prisma.$disconnect();
  }
}

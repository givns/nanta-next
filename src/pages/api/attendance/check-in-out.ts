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
    // Process attendance first
    const [processedAttendance, updatedStatus] = await Promise.all([
      attendanceService.processAttendance({
        ...task,
        checkTime: serverTime.toISOString(), // Convert to ISO string
      }),
      attendanceService.getAttendanceStatus(task.employeeId!, {
        inPremises: true,
        address: task.location?.address || '',
        periodType: task.periodType, // Add period type if available from task
      }),
    ]);

    if (!processedAttendance.success) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: 'Failed to process attendance',
      });
    }

    // Clear existing cache entries
    userCache.delete(task.employeeId || task.lineUserId!);
    processedRequests.delete(requestKey);

    // Cache the new result
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
        checkInOutQueue.push(validatedData, (error, queueResult) => {
          if (error) reject(error);
          else if (queueResult) {
            const isAutoCompleted =
              queueResult.status.validation.flags.requiresAutoCompletion;
            if (isAutoCompleted) {
              // Create regular time entry
              const regular = queueResult.status.daily?.currentState?.timeWindow
                ? {
                    // Core identifiers
                    id: 'auto-generated',
                    employeeId: validatedData.employeeId!,
                    date: new Date(),

                    // Time fields
                    startTime: new Date(
                      queueResult.status.daily.currentState.timeWindow.start,
                    ),
                    endTime: new Date(
                      queueResult.status.daily.currentState.timeWindow.end,
                    ),

                    // Status and type
                    status: TimeEntryStatus.COMPLETED,
                    entryType: PeriodType.REGULAR,

                    // Duration tracking with separated hours
                    hours: {
                      regular: calculateRegularHours(
                        new Date(
                          queueResult.status.daily.currentState.timeWindow.start,
                        ),
                        new Date(
                          queueResult.status.daily.currentState.timeWindow.end,
                        ),
                      ),
                      overtime: 0,
                    },

                    // References
                    attendanceId:
                      queueResult.status.base.latestAttendance?.id || null,
                    overtimeRequestId: null,

                    // Timing statistics
                    timing: {
                      actualMinutesLate: calculateMinutesLate(
                        new Date(
                          queueResult.status.daily.currentState.timeWindow.start,
                        ),
                        new Date(
                          queueResult.status.daily.currentState.timeWindow.end,
                        ),
                      ),
                      isHalfDayLate: false,
                    },

                    // Metadata
                    metadata: {
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      source: 'auto' as const,
                      version: 1,
                    },
                  }
                : undefined;

              // Transform transitions to TimeEntry array for overtime
              const overtime =
                queueResult.status.daily?.transitions.map((transition) => {
                  const startTime = new Date(transition.transitionTime);
                  const endTime = null; // Overtime might not have ended yet
                  const timeEntryId = `ot-${transition.from.periodIndex}`;

                  return {
                    // Core identifiers
                    id: timeEntryId,
                    employeeId: validatedData.employeeId!,
                    date: new Date(),

                    // Time fields
                    startTime,
                    endTime,

                    // Status and type
                    status: TimeEntryStatus.STARTED,
                    entryType: PeriodType.OVERTIME,

                    // Duration tracking
                    hours: {
                      regular: 0,
                      overtime: endTime
                        ? calculateOvertimeHours(startTime, endTime)
                        : 0,
                    },

                    // References
                    attendanceId:
                      queueResult.status.base.latestAttendance?.id || null,
                    overtimeRequestId:
                      queueResult.status.context?.nextPeriod?.overtimeInfo
                        ?.id || null,

                    // Timing statistics
                    timing: {
                      actualMinutesLate: 0, // Not applicable for overtime
                      isHalfDayLate: false,
                    },

                    // Overtime specific data
                    overtime: {
                      metadata: {
                        id: `otmeta-${timeEntryId}`,
                        timeEntryId,
                        isDayOffOvertime: Boolean(
                          queueResult.status.context?.nextPeriod?.overtimeInfo
                            ?.isDayOffOvertime,
                        ),
                        isInsideShiftHours: Boolean(
                          queueResult.status.context?.nextPeriod?.overtimeInfo
                            ?.isInsideShiftHours,
                        ),
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      },
                      startReason: 'Auto-generated overtime entry',
                      endReason: undefined,
                      comments: 'Created during auto-completion',
                    },

                    // Entry metadata
                    metadata: {
                      createdAt: new Date(),
                      updatedAt: new Date(),
                      source: 'auto' as const,
                      version: 1,
                    },
                  };
                }) || [];

              resolve({
                ...queueResult,
                message: 'ระบบได้ทำการลงเวลาย้อนหลังให้เรียบร้อยแล้ว',
                autoCompletedEntries: {
                  regular,
                  overtime,
                },
              });
            } else {
              resolve(queueResult);
            }
          } else reject(new Error('No result returned from queue'));
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

  // Helper functions for calculations
  function calculateRegularHours(startTime: Date, endTime: Date): number {
    const diffInMilliseconds = endTime.getTime() - startTime.getTime();
    // Convert milliseconds to hours with 2 decimal places
    return Number((diffInMilliseconds / (1000 * 60 * 60)).toFixed(2));
  }

  function calculateOvertimeHours(startTime: Date, endTime: Date): number {
    const diffInMilliseconds = endTime.getTime() - startTime.getTime();
    // Convert milliseconds to hours with 2 decimal places
    return Number((diffInMilliseconds / (1000 * 60 * 60)).toFixed(2));
  }

  function calculateMinutesLate(
    expectedStart: Date,
    actualStart: Date,
  ): number {
    if (actualStart <= expectedStart) return 0;
    const diffInMilliseconds = actualStart.getTime() - expectedStart.getTime();
    return Math.floor(diffInMilliseconds / (1000 * 60));
  }
}

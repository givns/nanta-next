// pages/api/attendance/check-in-out.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PeriodType, PrismaClient } from '@prisma/client';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { ProcessingOptions } from '@/types/attendance/processing';
import { CACHE_CONSTANTS } from '@/types/attendance/base';
import { getCurrentTime } from '@/utils/dateUtils';
import { validateCheckInOutRequest } from '@/schemas/attendance';
import {
  AttendanceStateResponse,
  AttendanceStatusResponse,
  QueueResult,
} from '@/types/attendance';
import { parseISO } from 'date-fns';
import { createRateLimitMiddleware } from '@/utils/rateLimit';
import { QueueManager } from '@/utils/QueueManager';
import { performance } from 'perf_hooks';

import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { cacheService } from '@/services/cache/CacheService';

interface ErrorResponse {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

const statusCache = new Map<string, { status: any; timestamp: number }>();

// ------- NEW: Add short-lived status cache -------
// Cache for attendance status tied to employee ID with short TTL
const STATUS_CACHE_TTL = 30000; // 30 seconds TTL
const shortLivedStatusCache = new Map<
  string,
  {
    status: AttendanceStatusResponse;
    timestamp: number;
  }
>();

// Function to get or fetch status with caching
async function getStatusWithCache(
  attendanceService: any,
  employeeId: string,
  options: any,
): Promise<AttendanceStatusResponse> {
  // Generate cache key based on employee ID and the current minute
  // This ensures we don't use stale data across minutes but reuse within same minute
  const currentMinuteTimestamp = Math.floor(Date.now() / 60000) * 60000;
  const cacheKey = `status-${employeeId}-${currentMinuteTimestamp}`;

  const cachedStatus = shortLivedStatusCache.get(cacheKey);

  if (cachedStatus && Date.now() - cachedStatus.timestamp < STATUS_CACHE_TTL) {
    console.log(
      `Using cached status from recent check (age: ${Date.now() - cachedStatus.timestamp}ms)`,
    );
    return cachedStatus.status;
  }

  // Fetch fresh status
  console.log(`Cache miss for ${cacheKey}, fetching fresh status`);
  const freshStatus = await attendanceService.getAttendanceStatus(
    employeeId,
    options,
  );

  // Store in cache
  shortLivedStatusCache.set(cacheKey, {
    status: freshStatus,
    timestamp: Date.now(),
  });

  // Set up automatic cleanup
  setTimeout(() => {
    if (shortLivedStatusCache.has(cacheKey)) {
      shortLivedStatusCache.delete(cacheKey);
      console.log(`Expired status cache for ${cacheKey}`);
    }
  }, STATUS_CACHE_TTL);

  return freshStatus;
}

// Cleanup function for status cache
function cleanupStatusCache() {
  const now = Date.now();
  let expiredCount = 0;

  for (const [key, entry] of shortLivedStatusCache.entries()) {
    if (now - entry.timestamp > STATUS_CACHE_TTL) {
      shortLivedStatusCache.delete(key);
      expiredCount++;
    }
  }

  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired status cache entries`);
  }
}

// Run cache cleanup periodically
setInterval(cleanupStatusCache, STATUS_CACHE_TTL / 2);
// --------------------------------------------

// Initialize services
// In your Prisma client initialization
const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  const start = Date.now();

  // Add request ID for tracking
  const requestId = `prisma-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  console.log(
    `[${requestId}] Starting Prisma operation: ${params.model}.${params.action}`,
  );

  const result = await next(params);

  const duration = Date.now() - start;
  if (duration > 1000) {
    // Log queries that take more than 1 second
    console.log(
      `[${requestId}] Slow query alert: ${params.model}.${params.action} took ${duration}ms`,
    );
  }

  return result;
});

const serviceQueue = getServiceQueue(prisma);
const queueManager = QueueManager.getInstance();

// Rate limit middleware
const rateLimitMiddleware = createRateLimitMiddleware(60 * 1000, 5);

// Cache configuration
const CACHE_PREFIX = 'user:';
const CACHE_TTL = 3600; // 1 hour

interface CachedUserData {
  employeeId: string;
  lineUserId?: string | null;
  timestamp: number;
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

async function getCachedUser(identifier: {
  employeeId?: string;
  lineUserId?: string;
}): Promise<CachedUserData | null> {
  const key = identifier.employeeId || identifier.lineUserId;
  if (!key) return null;

  const cacheKey = `${CACHE_PREFIX}${key}`;

  try {
    // Try to get from cache
    const cached = await cacheService.get(cacheKey);
    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        if (Date.now() - parsedCache.timestamp < CACHE_TTL * 1000) {
          return parsedCache;
        }
      } catch (error) {
        console.warn('Error parsing cached user data:', error);
      }
    }

    // Get fresh data
    const user = await prisma.user.findUnique({
      where: identifier.employeeId
        ? { employeeId: identifier.employeeId }
        : { lineUserId: identifier.lineUserId },
      select: {
        employeeId: true,
        lineUserId: true,
      },
    });

    if (user) {
      const userData = {
        ...user,
        timestamp: Date.now(),
      };

      // Cache the result
      try {
        await cacheService.set(cacheKey, JSON.stringify(userData), CACHE_TTL);
      } catch (error) {
        console.warn('Error caching user data:', error);
      }

      return userData;
    }

    return null;
  } catch (error) {
    console.error('Cache error:', error);
    return null;
  }
}

function isValidPreCalculatedStatus(status: any): boolean {
  return (
    status &&
    typeof status === 'object' &&
    status.base &&
    status.daily &&
    status.context &&
    status.validation
  );
}

// Main Processing Function
export async function processCheckInOut(
  task: ProcessingOptions,
): Promise<QueueResult> {
  const serverTime = getCurrentTime();
  if (isNaN(serverTime.getTime())) {
    console.error('Invalid server time:', serverTime);
    throw new AppError({
      code: ErrorCode.PROCESSING_ERROR,
      message: 'Invalid server time',
    });
  }
  const requestKey = `${task.employeeId || task.lineUserId}-${task.checkTime}`;

  console.log('Processing check-in/out task:', {
    requestKey,
    serverTime: serverTime.toISOString(),
    hasPreCalculatedStatus: !!task.preCalculatedStatus,
    preCalculatedStatusType: task.preCalculatedStatus
      ? typeof task.preCalculatedStatus
      : 'none',
    preCalculatedStatusKeys: task.preCalculatedStatus
      ? Object.keys(task.preCalculatedStatus)
      : [],
  });

  const startTime = performance.now();

  try {
    // Get services
    const services = await serviceQueue.getInitializedServices();
    const { attendanceService, notificationService } = services;

    // Use pre-calculated status if available and recent
    let currentStatus;
    if (
      task.preCalculatedStatus &&
      isValidPreCalculatedStatus(task.preCalculatedStatus) &&
      isRecentStatus(task.preCalculatedStatus, 20000)
    ) {
      // Increase to 20 seconds for testing
      console.log('Using pre-calculated status from client', {
        base: task.preCalculatedStatus.base?.state,
        daily: task.preCalculatedStatus.daily?.currentState?.type,
      });
      currentStatus = task.preCalculatedStatus;
    } else {
      // Log why pre-calculated status isn't being used
      if (task.preCalculatedStatus) {
        console.log('Not using pre-calculated status because:', {
          isValid: isValidPreCalculatedStatus(task.preCalculatedStatus),
          isRecent: task.preCalculatedStatus.base?.metadata?.lastUpdated
            ? isRecentStatus(task.preCalculatedStatus, 20000)
            : false,
          lastUpdated: task.preCalculatedStatus.base?.metadata?.lastUpdated,
        });
      }

      // Fallback to getting fresh status
      console.log('Getting fresh status from server');
      currentStatus = await getStatusWithCache(
        attendanceService, // Now this is correctly coming from services
        task.employeeId!,
        {
          inPremises: true,
          address: task.location?.address || '',
          periodType: task.periodType,
        },
      );
    }

    console.log('Current status flags for check-in/out:', {
      isEarlyCheckIn: currentStatus.validation.flags.isEarlyCheckIn,
      isLateCheckIn: currentStatus.validation.flags.isLateCheckIn,
      isCheckingIn: currentStatus.base.isCheckingIn,
      state: currentStatus.base.state,
      transitions: currentStatus.daily.transitions.length,
    });

    // Check if auto-completion needed based on current status
    const activeAttendance = currentStatus.base.latestAttendance;
    const needsAutoCompletion =
      (!activeAttendance?.CheckInTime && !task.activity.isCheckIn) ||
      (task.periodType === PeriodType.REGULAR &&
        task.activity.isCheckIn &&
        activeAttendance?.type === PeriodType.OVERTIME &&
        !activeAttendance.CheckOutTime &&
        activeAttendance.shiftEndTime &&
        serverTime > parseISO(activeAttendance.shiftEndTime)) ||
      (task.periodType === PeriodType.REGULAR &&
        !task.activity.isCheckIn &&
        currentStatus.context.nextPeriod?.type === PeriodType.OVERTIME &&
        currentStatus.daily.transitions.length > 0);

    if (needsAutoCompletion) {
      console.log('Auto-completion needed:', {
        noCheckIn: !activeAttendance?.CheckInTime,
        isCheckingIn: task.activity.isCheckIn,
        activeType: activeAttendance?.type,
        hasCheckOut: Boolean(activeAttendance?.CheckOutTime),
        overtimeEnd: activeAttendance?.shiftEndTime,
        transitions: currentStatus.daily.transitions.length,
        hasPendingTransition:
          currentStatus.validation.flags.hasPendingTransition,
        nextPeriodType: currentStatus.context.nextPeriod?.type,
      });

      // Add overtime ID from context if not present in task
      if (
        !task.metadata?.overtimeId &&
        currentStatus.context.nextPeriod?.overtimeInfo?.id
      ) {
        console.log(
          'Adding overtime ID from context:',
          currentStatus.context.nextPeriod.overtimeInfo.id,
        );

        if (!task.metadata) task.metadata = {};
        task.metadata.overtimeId =
          currentStatus.context.nextPeriod.overtimeInfo.id;
      }
    } else {
      console.log('Regular processing:', {
        type: task.periodType,
        isCheckIn: task.activity.isCheckIn,
        isOvertime: task.periodType === PeriodType.OVERTIME,
      });
    }

    // Process attendance with correct flags and current status
    const [processedAttendance, updatedStatus] = await Promise.all([
      attendanceService.processAttendance({
        ...task,
        checkTime: serverTime.toISOString(),
        activity: {
          ...task.activity,
          isOvertime: task.periodType === PeriodType.OVERTIME,
          overtimeMissed: Boolean(needsAutoCompletion),
        },
        // Pass current status to avoid recalculation
        preCalculatedStatus: currentStatus,
        // Add transition info from cached status if available
        transition:
          task.transition ||
          (() => {
            if (
              currentStatus.daily.transitions.length > 0 &&
              currentStatus.context.nextPeriod?.type
            ) {
              return {
                from: {
                  type: currentStatus.daily.currentState.type,
                  endTime: currentStatus.daily.currentState.timeWindow.end
                    .split('T')[1]
                    .slice(0, 5),
                },
                to: {
                  type: currentStatus.context.nextPeriod.type,
                  startTime: currentStatus.context.nextPeriod.startTime
                    ? currentStatus.context.nextPeriod.startTime
                        .split('T')[1]
                        .slice(0, 5)
                    : currentStatus.daily.currentState.timeWindow.end
                        .split('T')[1]
                        .slice(0, 5),
                },
              };
            }
            return undefined;
          })(),
      }),
      // Get fresh status after processing in parallel
      attendanceService.getAttendanceStatus(task.employeeId!, {
        inPremises: true,
        address: task.location?.address || '',
        periodType: task.periodType,
      }),
    ]);

    // --- INVALIDATE the status cache after processing ---
    // This ensures we don't reuse the now-stale status
    const currentMinuteTimestamp = Math.floor(Date.now() / 60000) * 60000;
    const cacheKey = `status-${task.employeeId}-${currentMinuteTimestamp}`;
    shortLivedStatusCache.delete(cacheKey);
    console.log(`Invalidated status cache for ${cacheKey} after processing`);

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
    const endTime = performance.now();
    console.log('End of processCheckInOut', {
      duration: endTime - startTime,
      task: task.requestId,
    });

    return {
      success: true,
      status: updatedStatus,
      notificationSent,
      timestamp: serverTime.toISOString(),
      requestId: task.requestId,
      data: {
        state: {
          current: updatedStatus.daily.currentState,
          previous: activeAttendance
            ? currentStatus.daily.currentState
            : undefined,
        },
        validation: updatedStatus.validation,
      },
      metadata: {
        source: task.activity.isManualEntry ? 'manual' : 'system',
      },
      message: needsAutoCompletion
        ? 'Attendance auto-completed due to missing check-in or overtime end'
        : undefined,
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

// Set the processing function for the queue manager
QueueManager.setProcessingFunction(processCheckInOut);

function isRecentStatus(
  status: AttendanceStatusResponse,
  maxAgeMs: number,
): boolean {
  if (!status?.base?.metadata?.lastUpdated) return false;

  const statusTimestamp = new Date(status.base.metadata.lastUpdated).getTime();
  const ageMs = Date.now() - statusTimestamp;

  console.log(`Status age check: ${ageMs}ms old, max allowed: ${maxAgeMs}ms`);
  return ageMs < maxAgeMs;
}

// Main API Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  cacheService.setForceBypass(true);

  const startTime = performance.now();
  const requestId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST method is allowed',
      requestId,
    });
  }

  try {
    // Apply rate limiting
    await rateLimitMiddleware(req);

    console.log('Incoming request:', {
      requestId,
      body: req.body,
    });

    // Validate request data
    const validatedData = validateCheckInOutRequest(req.body);

    // Get user data
    const user = await getCachedUser({
      employeeId: validatedData.employeeId,
      lineUserId: validatedData.lineUserId,
    });

    if (!user) {
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    // Skip synchronous processing attempt - always queue
    console.log(`Directly queueing task ${requestId}`);

    // Prepare task for queue
    const taskData = {
      ...validatedData,
      requestId,
    };

    // Get queue manager
    const queueManager = QueueManager.getInstance();

    // Enqueue but don't wait for result
    queueManager.enqueue(taskData).catch((error) => {
      console.error('Queue enqueue error:', error);
    });

    // Return immediate acceptance with polling URL
    return res.status(202).json({
      success: true,
      message: 'Request accepted, processing in background',
      requestId,
      statusUrl: `/api/attendance/task-status/${requestId}`, // Include URL for polling
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error) {
    console.error('Request failed:', {
      requestId,
      error,
      body: req.body,
    });

    const errorResponse = handleApiError(error);
    return res.status(errorResponse.status).json({
      success: false,
      error: errorResponse.message,
      code: errorResponse.code,
      details: errorResponse.details,
      requestId,
    });
  } finally {
    const duration = performance.now() - startTime;
    console.log(`Request ${requestId} handled in ${duration.toFixed(2)}ms`);

    await prisma.$disconnect();
  }
}

function handleApiError(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    switch (error.code) {
      case ErrorCode.INVALID_INPUT:
        return {
          status: 400,
          code: error.code,
          message: error.message,
          details: error.details,
        };

      case ErrorCode.PROCESSING_ERROR:
        return {
          status: 422,
          code: error.code,
          message: error.message,
          details: error.details,
        };
      case ErrorCode.TIMEOUT:
        return {
          status: 504,
          code: error.code,
          message:
            'Processing took too long, please check your attendance status',
        };
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return {
          status: 429,
          code: error.code,
          message: 'Too many requests, please try again later',
        };
      case ErrorCode.SERVICE_INITIALIZATION_ERROR:
        return {
          status: 503,
          code: error.code,
          message: 'Service temporarily unavailable, please try again',
          details: error.details,
        };

      default:
        return {
          status: 500,
          code: error.code,
          message: error.message,
          details: error.details,
        };
    }
  }

  return {
    status: 500,
    code: ErrorCode.UNKNOWN_ERROR,
    message: 'An unexpected error occurred',
  };
}

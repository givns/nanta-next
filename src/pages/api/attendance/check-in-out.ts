// pages/api/attendance/check-in-out.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PeriodType, PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import type { InitializedServices } from '@/types/attendance'; // Add this import
import { AppError, ErrorCode } from '@/types/attendance/error';
import { ProcessingOptions } from '@/types/attendance/processing';
import { ATTENDANCE_CONSTANTS, CACHE_CONSTANTS } from '@/types/attendance/base';
import { getCurrentTime } from '@/utils/dateUtils';
import { validateCheckInOutRequest } from '@/schemas/attendance';
import { AttendanceStateResponse, QueueResult } from '@/types/attendance';
import { addMinutes, parseISO } from 'date-fns';
import { createRateLimitMiddleware } from '@/utils/rateLimit';
import { QueueManager } from '@/utils/QueueManager';
import { performance } from 'perf_hooks';
import Redis from 'ioredis';

interface ErrorResponse {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
}

// Initialize services
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);
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

// Helper Functions
function getRequestKey(task: ProcessingOptions): string {
  return `${task.employeeId || task.lineUserId}-${task.checkTime}`;
}

class ServiceInitializationQueue {
  private static instance: ServiceInitializationQueue;
  private initializationPromise: Promise<InitializedServices> | null = null;

  private constructor() {}

  static getInstance(): ServiceInitializationQueue {
    if (!this.instance) {
      this.instance = new ServiceInitializationQueue();
    }
    return this.instance;
  }

  async getInitializedServices(): Promise<InitializedServices> {
    if (!this.initializationPromise) {
      this.initializationPromise = initializeServices(prisma).then(
        (services) => {
          if (!services.attendanceService || !services.notificationService) {
            throw new AppError({
              code: ErrorCode.SERVICE_INITIALIZATION_ERROR,
              message: 'Required services are not initialized',
            });
          }
          return services;
        },
      );
    }
    return this.initializationPromise;
  }
}

const serviceQueue = ServiceInitializationQueue.getInstance();

async function getCachedUser(identifier: {
  employeeId?: string;
  lineUserId?: string;
}): Promise<CachedUserData | null> {
  const key = identifier.employeeId || identifier.lineUserId;
  if (!key) return null;

  const cacheKey = `${CACHE_PREFIX}${key}`;

  try {
    // Try to get from cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsedCache = JSON.parse(cached);
      if (Date.now() - parsedCache.timestamp < CACHE_TTL * 1000) {
        return parsedCache;
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
      await redis.set(cacheKey, JSON.stringify(userData), 'EX', CACHE_TTL);

      return userData;
    }

    return null;
  } catch (error) {
    console.error('Cache error:', error);
    return null;
  }
}

// REPLACE the current getServices function with:
async function getServices(): Promise<InitializedServices> {
  try {
    const services = await serviceQueue.getInitializedServices();
    if (!services) {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to initialize services',
      });
    }
    return services;
  } catch (error) {
    console.error('Service initialization error:', error);
    throw new AppError({
      code: ErrorCode.SERVICE_INITIALIZATION_ERROR,
      message: 'Service initialization failed',
      originalError: error,
    });
  }
}

// Main Processing Function
export async function processCheckInOut(
  task: ProcessingOptions,
): Promise<QueueResult> {
  const services = await getServices();

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
    // Initialize services first
    const services = await getServices();

    // Apply rate limiting
    await rateLimitMiddleware(req);

    console.log('Incoming request:', {
      requestId,
      body: JSON.stringify(req.body, null, 2),
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

    // Check queue status
    const queueStatus = await queueManager.getQueueStatus(user.employeeId);
    if (queueStatus.isPending) {
      return res.status(409).json({
        success: false,
        error: 'Concurrent operation in progress',
        code: ErrorCode.MULTIPLE_ACTIVE_RECORDS,
        details: {
          queuePosition: queueStatus.position || 0, // Provide default value
          estimatedWaitTime: (queueStatus.position || 0) * 5,
        },
        requestId,
      });
    }

    // Get current status
    const currentStatus = await services.attendanceService.getAttendanceStatus(
      user.employeeId,
      {
        inPremises: true,
        address: validatedData.location?.address || '',
        periodType: validatedData.periodType,
      },
    );

    // Update validation flags
    validatedData.activity.overtimeMissed =
      currentStatus.validation.flags.requiresAutoCompletion;

    // Validate timestamp
    const serverTime = getCurrentTime();
    const requestTime = new Date(validatedData.checkTime);
    const maxAllowedTime = addMinutes(
      serverTime,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
    );

    if (requestTime > maxAllowedTime) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Check time exceeds allowed window',
        details: {
          serverTime: serverTime.toISOString(),
          requestTime: requestTime.toISOString(),
          maxAllowed: maxAllowedTime.toISOString(),
        },
      });
    }

    // Process through queue
    const result = await queueManager.enqueue(validatedData);

    // Handle timeout cases
    if (!result.success) {
      const currentStatus =
        await services.attendanceService.getAttendanceStatus(user.employeeId, {
          inPremises: true,
          address: '',
        });

      return res.status(200).json({
        success: true,
        data: currentStatus,
        message: 'Request processing continued in background',
        timestamp: getCurrentTime().toISOString(),
        requestId,
      });
    }

    const duration = performance.now() - startTime;
    console.log('Request completed:', {
      requestId,
      duration,
      success: result.success,
    });

    return res.status(200).json({
      success: true,
      data: result.status,
      notificationSent: result.notificationSent,
      timestamp: getCurrentTime().toISOString(),
      requestId,
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

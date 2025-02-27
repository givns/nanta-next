// pages/api/attendance/status/[employeeId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, PeriodType } from '@prisma/client';
import { z } from 'zod';
import { getServices } from '@/services/ServiceInitializer';
import {
  AppError,
  AttendanceStatusResponse,
  ErrorCode,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { format } from 'date-fns';
import { createRateLimitMiddleware } from '@/utils/rateLimit';
import { redisManager } from '@/services/RedisConnectionManager';

// Request flow tracking
const RequestTracker = {
  startTrack: (id: string) => {
    return {
      id,
      startTime: Date.now(),
      steps: [] as {
        name: string;
        timestamp: string;
        duration?: number;
        data?: any;
      }[],
      addStep: function (name: string, data?: any) {
        const now = new Date();
        const lastStep = this.steps[this.steps.length - 1];
        const duration = lastStep
          ? Date.now() - new Date(lastStep.timestamp).getTime()
          : 0;

        this.steps.push({
          name,
          timestamp: now.toISOString(),
          duration: duration,
          data,
        });

        console.log(`[${id}] STEP: ${name} (${duration}ms)`, data || '');
        return this;
      },
    };
  },
};

// Initialize Prisma client - optimized for serverless
const prisma = new PrismaClient({
  // MongoDB-specific options
  log: ['error', 'warn'],
  // Disable connection pooling for serverless
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Configure rate limiting
const rateLimitMiddleware = createRateLimitMiddleware(60 * 1000, 30); // 30 requests per minute

// Request validation schema
const QuerySchema = z.object({
  employeeId: z.string(),
  inPremises: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  address: z.string().optional().default(''),
  confidence: z.string().optional().default('low'),
  coordinates: z
    .string()
    .optional()
    .transform((coordsStr) => {
      if (!coordsStr) return undefined;
      try {
        const coords = JSON.parse(coordsStr);
        if (coords && coords.lat && coords.lng) {
          return {
            lat: Number(coords.lat),
            lng: Number(coords.lng),
            latitude: Number(coords.lat),
            longitude: Number(coords.lng),
          };
        }
      } catch (error) {
        console.warn('Error parsing coordinates:', error);
      }
      return undefined;
    }),
  adminVerified: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  shiftId: z.string().optional(),
  shiftCode: z.string().optional(), // Add shiftCode parameter

  _t: z.string().optional(), // Cache busting parameter
});

type ApiResponse =
  | AttendanceStatusResponse
  | {
      error: string;
      message: string;
      details?: unknown;
      timestamp?: string;
    };

// New function to handle attendance status with Redis failover
async function getAttendanceStatusWithRedisFailover(
  employeeId: string,
  services: any,
  options: {
    inPremises: boolean;
    address: string;
    periodType?: PeriodType;
  },
  tracker: any,
): Promise<AttendanceStatusResponse> {
  // Use a shorter timeout specifically for this endpoint
  const REDIS_TIMEOUT = 500; // 500ms max for Redis operations

  // Check if Redis is already disabled by circuit breaker
  const isRedisDisabled = !redisManager.isAvailable();

  if (isRedisDisabled) {
    tracker.addStep('redis_circuit_open');

    const isRedisAvailable =
      redisManager && redisManager.isAvailable && redisManager.isAvailable();

    if (!isRedisAvailable) {
      tracker.addStep('redis_not_available');
      // Skip Redis completely - get fresh data always
      return await services.attendanceService.getAttendanceStatus(
        employeeId,
        options,
      );
    }
  }

  try {
    // Start with a Promise.race to limit total Redis operation time
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Redis timeout for status endpoint'));
      }, REDIS_TIMEOUT);
    });

    const fetchPromise = services.attendanceService.getAttendanceStatus(
      employeeId,
      options,
    );

    tracker.addStep('attendance_status_race');

    // Race the two promises
    return await Promise.race([fetchPromise, timeoutPromise]);
  } catch (error) {
    // If Redis times out, log and fallback to fresh data
    console.warn(
      `Redis timeout for employee ${employeeId}, falling back to direct DB access`,
    );
    tracker.addStep('redis_timeout_fallback');

    // Force memory-only mode for this request
    return await services.attendanceService.getAttendanceStatus(
      employeeId,
      options,
    );
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  // Create request ID for tracking
  const requestId = `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // Initialize request tracker
  const tracker = RequestTracker.startTrack(requestId);
  tracker.addStep('request_received', {
    method: req.method,
    url: req.url,
    query: req.query,
  });

  // Check for valid HTTP method
  if (req.method !== 'GET') {
    console.warn(`[${requestId}] Method not allowed: ${req.method}`);
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET method is allowed',
    });
  }

  // Apply rate limiting
  try {
    tracker.addStep('rate_limit_check');
    await rateLimitMiddleware(req);
    tracker.addStep('rate_limit_passed');
  } catch (error) {
    tracker.addStep('rate_limit_failed', { error });
    return res.status(429).json({
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests, please try again later',
      timestamp: getCurrentTime().toISOString(),
    });
  }

  // Track processing time
  const startTime = Date.now();

  try {
    // Get services
    tracker.addStep('get_services_start');
    const services = await getServices(prisma);
    tracker.addStep('get_services_complete', {
      hasAttendanceService: !!services.attendanceService,
      hasShiftService: !!services.shiftService,
      hasPeriodManager: !!(services.attendanceService as any)?.periodManager,
    });

    // Validate request parameters
    tracker.addStep('validate_params_start');
    const validatedParams = QuerySchema.safeParse(req.query);

    if (!validatedParams.success) {
      tracker.addStep('validate_params_failed', {
        errors: validatedParams.error.format(),
      });

      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
        details: validatedParams.error.format(),
        timestamp: getCurrentTime().toISOString(),
      });
    }

    const {
      employeeId,
      inPremises,
      address,
      coordinates,
      adminVerified,
      shiftId,
      shiftCode,
    } = validatedParams.data;

    const now = getCurrentTime();

    tracker.addStep('validate_params_success', {
      employeeId,
      inPremises: Boolean(inPremises),
      hasCoordinates: !!coordinates,
      adminVerified: Boolean(adminVerified),
      shiftId,
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

    let user;

    // Use shiftId or shiftCode if provided to avoid database lookup
    if (shiftId || shiftCode) {
      user = {
        employeeId,
        shiftId,
        shiftCode: shiftCode || null, // Include shiftCode
        lineUserId: req.headers['x-line-userid'] || null,
        name: null,
        departmentName: null,
      };

      tracker.addStep('use_provided_shift_data', {
        employeeId,
        shiftId,
        shiftCode,
      });
    } else {
      // Only fetch from database if neither shiftId nor shiftCode provided
      tracker.addStep('find_user_start');
      user = await prisma.user.findUnique({
        where: {
          employeeId: employeeId,
        },
        select: {
          employeeId: true,
          lineUserId: true,
          shiftId: true,
          shiftCode: true, // Include shiftCode in selection
          name: true,
          departmentName: true,
        },
      });

      if (!user) {
        tracker.addStep('find_user_not_found');
        return res.status(404).json({
          error: ErrorCode.USER_NOT_FOUND,
          message: 'User not found',
          timestamp: getCurrentTime().toISOString(),
        });
      }

      tracker.addStep('find_user_success', {
        userFound: true,
        lineUserIdExists: !!user.lineUserId,
        hasShiftId: !!user.shiftId,
        hasShiftCode: !!user.shiftCode,
      });
    }

    // Check for shiftId or shiftCode - try to get shift by code if needed
    if (!user.shiftId && !user.shiftCode) {
      tracker.addStep('missing_shift_info');
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message:
          'Shift configuration not found - missing both shiftId and shiftCode',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    if (!user.shiftId) {
      tracker.addStep('missing_shift_id_using_code_instead');
      console.log(
        `User ${employeeId} has no shiftId, services will use shiftCode ${user.shiftCode}`,
      );
    }

    // Get attendance status with the new failover function
    tracker.addStep('get_attendance_status_start');

    // Use the new function to handle Redis timeouts
    let attendanceStatus: AttendanceStatusResponse;
    try {
      attendanceStatus = await getAttendanceStatusWithRedisFailover(
        employeeId,
        services,
        {
          inPremises: adminVerified ? true : Boolean(inPremises),
          address: address || '',
          periodType: PeriodType.REGULAR, // Default to regular period
        },
        tracker,
      );

      tracker.addStep('attendance_service_complete', {
        durationMs: Date.now() - startTime,
        hasResult: !!attendanceStatus,
        hasBase: !!attendanceStatus?.base,
        hasDaily: !!attendanceStatus?.daily,
        hasContext: !!attendanceStatus?.context,
        state: attendanceStatus?.base?.state,
        checkStatus: attendanceStatus?.base?.checkStatus,
      });
    } catch (error) {
      tracker.addStep('attendance_service_error', {
        durationMs: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    // Log detailed result information
    tracker.addStep('get_attendance_status_complete', {
      state: attendanceStatus.base.state,
      checkStatus: attendanceStatus.base.checkStatus,
      isCheckingIn: attendanceStatus.base.isCheckingIn,
      hasLatestAttendance: !!attendanceStatus.base.latestAttendance,
      periodType: attendanceStatus.base.periodInfo.type,
      isOvertime: attendanceStatus.base.periodInfo.isOvertime,
      transitions: attendanceStatus.daily.transitions.length,
      currentStateType: attendanceStatus.daily.currentState.type,
      validation: {
        allowed: attendanceStatus.validation.allowed,
        hasFlags: !!attendanceStatus.validation.flags,
        requiredAction: attendanceStatus.validation.metadata?.requiredAction,
      },
      context: {
        hasShift: !!attendanceStatus.context.shift,
        hasNextPeriod: !!attendanceStatus.context.nextPeriod,
        nextPeriodType: attendanceStatus.context.nextPeriod?.type,
        hasTransition: !!attendanceStatus.context.transition,
      },
    });

    // Log success and processing time
    const processingTime = Date.now() - startTime;

    tracker.addStep('response_preparation', {
      processingTimeMs: processingTime,
      transitions: attendanceStatus.daily.transitions.length,
      nextPeriod: attendanceStatus.context.nextPeriod?.type || 'none',
    });

    // Add performance metrics header
    res.setHeader('X-Processing-Time', processingTime.toString());
    res.setHeader('X-Request-ID', requestId);

    // Final logging of complete request flow
    console.log(`[${requestId}] COMPLETE REQUEST FLOW:`, {
      employeeId,
      totalSteps: tracker.steps.length,
      totalTime: processingTime,
      state: attendanceStatus.base.state,
      checkStatus: attendanceStatus.base.checkStatus,
      steps: tracker.steps.map((s) => ({
        name: s.name,
        duration: s.duration,
      })),
    });

    return res.status(200).json(attendanceStatus);
  } catch (error) {
    // Calculate processing time even for errors
    const processingTime = Date.now() - startTime;

    tracker.addStep('error_occurred', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
      errorType:
        error instanceof AppError
          ? 'AppError'
          : error instanceof z.ZodError
            ? 'ZodError'
            : error instanceof Error
              ? error.constructor.name
              : 'Unknown',
      processingTimeMs: processingTime,
    });

    console.error(`[${requestId}] Error processing attendance status`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: processingTime,
      query: req.query,
      flowSteps: tracker.steps.map((s) => ({
        name: s.name,
        duration: s.duration,
      })),
    });

    // Handle specific error types
    if (error instanceof AppError) {
      return res.status(400).json({
        error: error.code,
        message: error.message,
        details: error.details,
        timestamp: getCurrentTime().toISOString(),
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
        details: error.format(),
        timestamp: getCurrentTime().toISOString(),
      });
    }

    // Generic error handler
    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
      details: {
        timestamp: getCurrentTime().toISOString(),
        requestId,
        requestPath: tracker.steps.map((s) => s.name).join(' → '),
      },
    });
  } finally {
    // Always disconnect Prisma in serverless environment
    tracker.addStep('prisma_disconnect');
    await prisma.$disconnect();
  }
}

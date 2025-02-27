// pages/api/attendance/status/[employeeId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, PeriodType } from '@prisma/client';
import { z } from 'zod';
import { getServices } from '@/services/ServiceInitializer';
import {
  AppError,
  AttendanceStatusResponse,
  ErrorCode,
  ValidationContext,
  ShiftData,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { format } from 'date-fns';
import { createRateLimitMiddleware } from '@/utils/rateLimit';

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

    const { employeeId, inPremises, address, coordinates, adminVerified } =
      validatedParams.data;
    const now = getCurrentTime();

    tracker.addStep('validate_params_success', {
      employeeId,
      inPremises: Boolean(inPremises),
      hasCoordinates: !!coordinates,
      adminVerified: Boolean(adminVerified),
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

    // Check if user exists and get shift data
    tracker.addStep('find_user_start');
    const user = await prisma.user.findFirst({
      where: {
        employeeId: {
          equals: employeeId,
        },
      },
      select: {
        employeeId: true,
        lineUserId: true,
        shiftId: true,
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
      hasShiftId: !!user.shiftId,
      lineUserIdExists: !!user.lineUserId,
    });

    // Get user's shift
    tracker.addStep('get_user_shift_start');
    const userShift = await services.shiftService.getUserShift(employeeId);
    tracker.addStep('get_user_shift_complete', {
      hasShift: !!userShift,
      shiftId: userShift?.id,
      workDays: userShift?.workDays,
      shiftTimes: userShift
        ? `${userShift.startTime}-${userShift.endTime}`
        : null,
    });

    // Convert null to undefined for shift to satisfy TypeScript
    const shift: ShiftData | undefined = userShift || undefined;

    // Create validation context
    tracker.addStep('create_validation_context');
    const context: ValidationContext = {
      employeeId,
      timestamp: now,
      isCheckIn: true, // Will be updated based on current state
      shift,
      periodType: PeriodType.REGULAR,
      isOvertime: false,
      overtimeInfo: null,
      location: coordinates,
      address: address || '',
    };

    const BYPASS_REDIS_FOR_STATUS = true; // Force bypass for this endpoint

    // Get attendance status with updated parameters structure
    tracker.addStep('get_attendance_status_start');

    if (BYPASS_REDIS_FOR_STATUS) {
      services.attendanceService.useMemoryCacheOnly = true;
    }

    // Rather than trying to modify the Promise itself, we'll use a simple approach
    // with manual timing that's TypeScript-safe
    const attendanceStartTime = Date.now();
    let attendanceStatus: AttendanceStatusResponse;

    try {
      attendanceStatus = await services.attendanceService.getAttendanceStatus(
        employeeId,
        {
          inPremises: adminVerified ? true : Boolean(inPremises),
          address: address || '',
          periodType: PeriodType.REGULAR, // Default to regular period
        },
      );

      tracker.addStep('attendance_service_complete', {
        durationMs: Date.now() - attendanceStartTime,
        hasResult: !!attendanceStatus,
        hasBase: !!attendanceStatus?.base,
        hasDaily: !!attendanceStatus?.daily,
        hasContext: !!attendanceStatus?.context,
        state: attendanceStatus?.base?.state,
        checkStatus: attendanceStatus?.base?.checkStatus,
      });
    } catch (error) {
      tracker.addStep('attendance_service_error', {
        durationMs: Date.now() - attendanceStartTime,
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

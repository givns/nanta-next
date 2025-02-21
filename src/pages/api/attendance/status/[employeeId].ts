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

  // Log start of request processing
  console.log(`[${requestId}] Attendance status request received`, {
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
    await rateLimitMiddleware(req);
  } catch (error) {
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
    const services = await getServices(prisma);

    // Validate request parameters
    const validatedParams = QuerySchema.safeParse({
      ...req.query,
      coordinates: JSON.stringify({
        lat: req.query['coordinates[lat]'] || null,
        lng: req.query['coordinates[lng]'] || null,
      }),
    });

    if (!validatedParams.success) {
      console.warn(`[${requestId}] Invalid request parameters`, {
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

    console.log(`[${requestId}] Processing attendance status request`, {
      employeeId,
      inPremises: Boolean(inPremises),
      hasCoordinates: !!coordinates,
      adminVerified: Boolean(adminVerified),
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

    // FIX: Use findFirst with a string comparison instead of findUnique with ObjectId
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
      return res.status(404).json({
        error: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    // Get user's shift
    const userShift = await services.shiftService.getUserShift(employeeId);

    // Convert null to undefined for shift to satisfy TypeScript
    const shift: ShiftData | undefined = userShift || undefined;

    if (!shift) {
      return res.status(400).json({
        error: ErrorCode.SHIFT_DATA_ERROR,
        message: 'No shift configuration found for user',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    // Create validation context
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

    // Get attendance status with updated parameters structure
    const attendanceStatus =
      await services.attendanceService.getAttendanceStatus(employeeId, {
        inPremises: adminVerified ? true : Boolean(inPremises),
        address: address || '',
        periodType: PeriodType.REGULAR, // Default to regular period
      });

    // Log success and processing time
    const processingTime = Date.now() - startTime;

    console.log(`[${requestId}] Attendance status processed successfully`, {
      employeeId,
      state: attendanceStatus.base.state,
      checkStatus: attendanceStatus.base.checkStatus,
      processingTimeMs: processingTime,
      transitions: attendanceStatus.daily.transitions.length,
      nextPeriod: attendanceStatus.context.nextPeriod?.type || 'none',
    });

    // Add performance metrics header
    res.setHeader('X-Processing-Time', processingTime.toString());
    res.setHeader('X-Request-ID', requestId);

    return res.status(200).json(attendanceStatus);
  } catch (error) {
    // Calculate processing time even for errors
    const processingTime = Date.now() - startTime;

    console.error(`[${requestId}] Error processing attendance status`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      processingTimeMs: processingTime,
      query: req.query,
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
      },
    });
  } finally {
    // Always disconnect Prisma in serverless environment
    await prisma.$disconnect();
  }
}

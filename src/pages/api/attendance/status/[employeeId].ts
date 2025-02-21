import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { initializeServices } from '@/services/ServiceInitializer';
import {
  AppError,
  AttendanceStatusResponse,
  ErrorCode,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { createRateLimitMiddleware } from '@/utils/rateLimit';

// Initialize Prisma client
const prisma = new PrismaClient();

// Type for initialized services
type InitializedServices = Awaited<ReturnType<typeof initializeServices>>;

// Cache the services initialization promise
let servicesPromise: Promise<InitializedServices> | null = null;

// Rate limit configuration based on endpoint type
const rateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many status check requests',
};
const rateLimitMiddleware = createRateLimitMiddleware(60 * 1000, 30); // 30 requests per minute

// Request validation schema
const QuerySchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  inPremises: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  address: z.string().optional().default(''),
  confidence: z.string().optional().default('low'),
  coordinates: z
    .record(z.any())
    .transform((coords) => {
      if (coords.lat && coords.lng) {
        const lat = Number(coords.lat);
        const lng = Number(coords.lng);

        // Validate coordinates
        if (
          isNaN(lat) ||
          isNaN(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          return undefined;
        }

        return {
          lat,
          lng,
          latitude: lat,
          longitude: lng,
        };
      }
      return undefined;
    })
    .optional(),
  adminVerified: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

type ApiResponse =
  | { success: true; data: AttendanceStatusResponse; timestamp: string }
  | {
      success: false;
      error: string;
      code: ErrorCode;
      details?: unknown;
      timestamp: string;
      requestId?: string;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  const startTime = performance.now();
  const requestId = `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed',
      code: ErrorCode.INVALID_INPUT,
      timestamp: getCurrentTime().toISOString(),
      requestId,
    });
  }

  try {
    // Apply rate limiting
    await rateLimitMiddleware(req);

    // Get and validate services
    const services = await getServices();
    const validatedParams = await validateRequest(req.query);

    console.log('Processing attendance status request:', {
      requestId,
      employeeId: validatedParams.employeeId,
      timestamp: getCurrentTime().toISOString(),
      locationData: {
        inPremises: validatedParams.inPremises,
        hasCoordinates: !!validatedParams.coordinates,
      },
    });

    // Get attendance status
    const attendanceStatus =
      await services.attendanceService.getAttendanceStatus(
        validatedParams.employeeId,
        {
          inPremises: validatedParams.inPremises || false,
          address: validatedParams.address || '',
        },
      );

    // Log performance
    const duration = performance.now() - startTime;
    console.log('Attendance status request completed:', {
      requestId,
      duration,
      employeeId: validatedParams.employeeId,
    });

    return res.status(200).json({
      success: true,
      data: attendanceStatus,
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error) {
    console.error('Attendance status error:', {
      requestId,
      error,
      query: req.query,
    });

    const errorResponse = handleApiError(error);
    return res.status(errorResponse.status).json({
      success: false,
      error: errorResponse.message,
      code: errorResponse.code,
      details: errorResponse.details,
      timestamp: getCurrentTime().toISOString(),
      requestId,
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Helper functions
async function getServices(): Promise<InitializedServices> {
  if (!servicesPromise) {
    console.log('Initializing services...');
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
}

async function validateRequest(query: any) {
  try {
    return QuerySchema.parse(query);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError({
        code: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
        details: error.format(),
      });
    }
    throw error;
  }
}

interface ErrorResponse {
  status: number;
  code: ErrorCode;
  message: string;
  details?: unknown;
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
      case ErrorCode.UNAUTHORIZED:
        return {
          status: 401,
          code: error.code,
          message: error.message,
        };
      case ErrorCode.NOT_FOUND:
        return {
          status: 404,
          code: error.code,
          message: error.message,
        };
      case ErrorCode.TIMEOUT:
        return {
          status: 504,
          code: error.code,
          message: 'Request timed out',
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

  if (error instanceof Error) {
    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message,
    };
  }

  return {
    status: 500,
    code: ErrorCode.UNKNOWN_ERROR,
    message: 'An unexpected error occurred',
  };
}

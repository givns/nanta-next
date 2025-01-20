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
import { format } from 'date-fns';

// Initialize Prisma client
const prisma = new PrismaClient();

// Type for initialized services
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
    .record(z.any())
    .transform((coords) =>
      coords.lat && coords.lng
        ? {
            lat: Number(coords.lat),
            lng: Number(coords.lng),
            latitude: Number(coords.lat),
            longitude: Number(coords.lng),
          }
        : undefined,
    )
    .optional(),
});

type ApiResponse =
  | AttendanceStatusResponse
  | {
      error: string;
      message: string;
      details?: unknown;
    };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET method is allowed',
    });
  }

  try {
    const services = await getServices();
    const validatedParams = QuerySchema.safeParse(req.query);
    if (!validatedParams.success) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
        details: validatedParams.error.format(),
      });
    }

    const { employeeId, inPremises, address, coordinates } =
      validatedParams.data;
    const now = getCurrentTime();

    // Get attendance status using the correct parameter structure
    const attendanceStatus =
      await services.attendanceService.getAttendanceStatus(employeeId, {
        inPremises: inPremises || false,
        address: address || '',
        // Only pass periodType if needed, remove location as it's not part of the interface
      });

    // Log final state
    console.log('Final response state:', {
      hasTransitions: attendanceStatus.daily.transitions.length > 0,
      hasShift: Boolean(attendanceStatus.context.shift.id),
      hasOvertime: Boolean(attendanceStatus.context.nextPeriod?.overtimeInfo),
      transitionState: attendanceStatus.context.transition,
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

    return res.status(200).json(attendanceStatus);
  } catch (error) {
    console.error('Attendance status error:', error);

    if (error instanceof AppError) {
      return res.status(400).json({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
        details: error.format(),
      });
    }

    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
      details: { timestamp: getCurrentTime().toISOString() },
    });
  } finally {
    await prisma.$disconnect();
  }
}

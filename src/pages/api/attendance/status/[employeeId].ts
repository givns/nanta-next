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
        ? { lat: Number(coords.lat), lng: Number(coords.lng) }
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
    // Initialize services
    const services = await getServices();

    // Validate request parameters
    const validatedParams = QuerySchema.safeParse(req.query);
    if (!validatedParams.success) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
        details: validatedParams.error.format(),
      });
    }

    const { employeeId, inPremises, address } = validatedParams.data;
    const now = getCurrentTime();

    // Get period state first
    const periodState = await services.shiftService.getCurrentPeriodState(
      employeeId,
      now,
    );
    if (!periodState) {
      throw new AppError({
        code: ErrorCode.SHIFT_DATA_ERROR,
        message: 'Failed to fetch period state',
      });
    }

    // Get attendance status
    const attendanceStatus =
      await services.attendanceService.getAttendanceStatus(employeeId, {
        inPremises,
        address,
      });

    if (!attendanceStatus) {
      throw new AppError({
        code: ErrorCode.ATTENDANCE_ERROR,
        message: 'Failed to fetch attendance status',
      });
    }

    // Log pre-processing state
    console.log('Pre-processing state:', {
      transitions: attendanceStatus.daily?.transitions?.length || 0,
      hasShift: Boolean(attendanceStatus.context?.shift),
      hasOvertime: Boolean(attendanceStatus.context?.nextPeriod?.overtimeInfo),
    });

    // Construct response
    const response: AttendanceStatusResponse = {
      daily: {
        date: format(now, 'yyyy-MM-dd'),
        currentState: attendanceStatus.daily.currentState,
        transitions: attendanceStatus.daily.transitions,
      },
      base: {
        ...attendanceStatus.base,
        metadata: {
          lastUpdated: now.toISOString(),
          version: 1,
          source: attendanceStatus.base.metadata?.source || 'system',
        },
      },
      context: {
        shift: periodState.shift,
        schedule: {
          isHoliday: Boolean(attendanceStatus.context.schedule.isHoliday),
          isDayOff: Boolean(attendanceStatus.context.schedule.isDayOff),
          isAdjusted: Boolean(attendanceStatus.context.schedule.isAdjusted),
          holidayInfo: attendanceStatus.context.schedule.holidayInfo,
        },
        nextPeriod: periodState.nextPeriod,
        transition: periodState.transition,
      },
      validation: {
        allowed: Boolean(attendanceStatus.validation.allowed),
        reason: attendanceStatus.validation.reason || '',
        flags: {
          ...attendanceStatus.validation.flags,
          hasPendingTransition: attendanceStatus.daily.transitions.length > 0,
        },
        metadata: attendanceStatus.validation.metadata,
      },
    };

    // Log final state
    console.log('Final response state:', {
      hasTransitions: response.daily.transitions.length > 0,
      hasShift: Boolean(response.context.shift.id),
      hasOvertime: Boolean(response.context.nextPeriod?.overtimeInfo),
      transitionState: response.context.transition,
    });

    return res.status(200).json(response);
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

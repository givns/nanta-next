import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import {
  AppError,
  ErrorCode,
  NextDayScheduleResponse,
  OvertimeContext,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import { startOfDay, addDays, endOfDay, format } from 'date-fns';

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
const ParamsSchema = z.object({
  employeeId: z.string(),
});

type ApiResponse =
  | NextDayScheduleResponse
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

    // Validate request parameters
    const validatedParams = ParamsSchema.safeParse(req.query);
    if (!validatedParams.success) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
        details: validatedParams.error.format(),
      });
    }

    const { employeeId } = validatedParams.data;
    const now = getCurrentTime();
    const nextDay = addDays(now, 1);

    // Get next day period state from period manager
    const nextDayState = await services.periodManager.getNextDayPeriodState(
      employeeId,
      nextDay,
    );

    // Get overtime information for next day
    const nextDayOvertimes =
      (await services.overtimeService.getDetailedOvertimesInRange(
        employeeId,
        startOfDay(nextDay),
        endOfDay(nextDay),
      )) || [];

    // Map overtimes to OvertimeContext
    const mappedOvertimes: OvertimeContext[] = nextDayOvertimes.map((ot) => ({
      id: ot.id,
      startTime: format(new Date(ot.startTime), 'HH:mm'),
      endTime: format(new Date(ot.endTime), 'HH:mm'),
      durationMinutes: ot.durationMinutes,
      isInsideShiftHours: ot.isInsideShiftHours,
      isDayOffOvertime: ot.isDayOffOvertime,
      reason: ot.reason || undefined,
    }));

    const response: NextDayScheduleResponse = {
      current: nextDayState.current,
      type: nextDayState.type,
      shift: nextDayState.shift,
      isHoliday: nextDayState.isHoliday,
      isDayOff: nextDayState.isDayOff,
      isAdjusted: nextDayState.isAdjusted,
      holidayInfo: nextDayState.holidayInfo,
      overtimes: mappedOvertimes,
    };

    // Log final state
    console.log('Next day response state:', {
      hasShift: Boolean(response.shift?.id),
      hasOvertimes: response.overtimes.length,
      isDayOff: response.isDayOff,
      isHoliday: response.isHoliday,
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error('Next day info error:', error);

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

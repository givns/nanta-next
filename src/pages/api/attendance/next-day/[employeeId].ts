// pages/api/attendance/next-day/[employeeId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  AppError,
  ErrorCode,
  NextDayScheduleInfo,
  NextDayScheduleResponse,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';
import { startOfDay, addDays, endOfDay } from 'date-fns';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET method is allowed',
    });
  }

  try {
    const { employeeId } = req.query;
    const services = await getServices();

    const nextDayState = await services.shiftService.getNextDayPeriodState(
      employeeId as string,
      getCurrentTime(),
    );

    const nextDayOvertimes =
      (await services.overtimeService.getDetailedOvertimesInRange(
        employeeId as string,
        startOfDay(addDays(getCurrentTime(), 1)),
        endOfDay(addDays(getCurrentTime(), 1)),
      )) || [];

    const response: NextDayScheduleResponse = {
      current: nextDayState.current,
      type: nextDayState.type,
      shift: nextDayState.shift,
      isHoliday: nextDayState.isHoliday,
      isDayOff: nextDayState.isDayOff,
      isAdjusted: nextDayState.isAdjusted,
      holidayInfo: nextDayState.holidayInfo,

      overtimes: nextDayOvertimes.map((ot) => ({
        id: ot.id,
        startTime: ot.startTime,
        endTime: ot.endTime,
        durationMinutes: ot.durationMinutes,
        isInsideShiftHours: ot.isInsideShiftHours,
        isDayOffOvertime: ot.isDayOffOvertime,
        reason: ot.reason || undefined,
      })),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Next day info error:', error);
    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

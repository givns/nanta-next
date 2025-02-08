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
import { startOfDay, addDays, endOfDay, format, isSameDay } from 'date-fns';

type MappedOvertime = {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string; // Make reason optional to match OvertimeContext
};

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
    // First get the last active period to determine proper "next day"
    const lastPeriod =
      await services.attendanceRecordService.getLatestAttendanceRecord(
        employeeId,
      );

    console.log('Last period details:', {
      hasRecord: !!lastPeriod,
      checkInTime: lastPeriod?.CheckInTime,
      checkOutTime: lastPeriod?.CheckOutTime,
      shiftEnd: lastPeriod?.shiftEndTime,
      currentTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

    // Determine the correct next day based on last period
    const nextDay = (() => {
      if (!lastPeriod?.CheckOutTime) {
        // If there's no checkout time, use tomorrow from now
        return addDays(now, 1);
      }
      const checkOutTime = new Date(lastPeriod.CheckOutTime);
      const shiftEndTime = new Date(lastPeriod.shiftEndTime!);

      // If it's an overnight period that ends tomorrow morning
      if (shiftEndTime > checkOutTime && isSameDay(checkOutTime, now)) {
        // Use the day after checkout
        return addDays(checkOutTime, 1);
      }

      // Otherwise use tomorrow from now
      return addDays(now, 1);
    })();

    console.log('Next day calculation:', {
      calculatedDate: format(nextDay, 'yyyy-MM-dd'),
      baseDate: format(now, 'yyyy-MM-dd'),
    });

    // Get overtime information for next day
    const nextDayOvertimes =
      (await services.overtimeService.getDetailedOvertimesInRange(
        employeeId,
        startOfDay(nextDay),
        endOfDay(nextDay),
      )) || [];

    const mappedOvertimes = (nextDayOvertimes || [])
      .map((ot) => {
        try {
          // Log raw overtime data
          console.log('Processing overtime:', {
            id: ot.id,
            rawStartTime: ot.startTime,
            rawEndTime: ot.endTime,
            startTimeType: typeof ot.startTime,
            endTimeType: typeof ot.endTime,
          });

          // Date validation...
          const startDate = new Date(ot.startTime);
          const endDate = new Date(ot.endTime);

          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.error('Invalid date found in overtime:', {
              id: ot.id,
              startTime: ot.startTime,
              endTime: ot.endTime,
            });
            return null;
          }

          const overtime: MappedOvertime = {
            id: ot.id,
            startTime: format(startDate, 'HH:mm'),
            endTime: format(endDate, 'HH:mm'),
            durationMinutes: ot.durationMinutes,
            isInsideShiftHours: ot.isInsideShiftHours,
            isDayOffOvertime: ot.isDayOffOvertime,
          };

          // Only add reason if it exists
          if (ot.reason) {
            overtime.reason = ot.reason;
          }

          return overtime;
        } catch (error) {
          console.error('Error mapping overtime:', {
            error,
            overtime: ot,
          });
          return null;
        }
      })
      .filter((ot): ot is OvertimeContext => ot !== null);

    // Log successful mappings
    console.log('Successfully mapped overtimes:', {
      totalInput: nextDayOvertimes?.length || 0,
      successfulMappings: mappedOvertimes.length,
      mappedTimes: mappedOvertimes.map((ot) => ({
        id: ot.id,
        start: ot.startTime,
        end: ot.endTime,
      })),
    });

    // Get next day period state from period manager
    const nextDayState = await services.periodManager.getNextDayPeriodState(
      employeeId,
      nextDay,
    );

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

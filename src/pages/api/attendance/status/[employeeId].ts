// pages/api/attendance/status/[employeeId].ts
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
import { CacheManager } from '@/services/cache/CacheManager';

// Initialize services using ServiceInitializer
const prisma = new PrismaClient();
const services = initializeServices(prisma);
const { shiftService, enhancementService } = services;

// Initialize CacheManager properly
try {
  CacheManager.initialize(prisma, shiftService, enhancementService);
} catch (error) {
  console.error('Error initializing CacheManager:', error);
  // Continue without cache if initialization fails
}

// Get CacheManager instance with fallback
const getCacheManager = () => {
  try {
    return CacheManager.getInstance();
  } catch (error) {
    console.warn('CacheManager not available:', error);
    return null;
  }
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

    // Try cache first
    // Try cache with fallback
    const cacheManager = getCacheManager();
    if (cacheManager) {
      const cachedState = await cacheManager.getAttendanceState(
        employeeId as string,
      );
      if (cachedState) {
        return res.status(200).json(cachedState);
      }
    }

    // Get attendance status
    const attendanceStatus =
      await services.attendanceService.getAttendanceStatus(
        employeeId as string,
        {
          inPremises,
          address: address as string,
        },
      );

    if (!attendanceStatus) {
      throw new AppError({
        code: ErrorCode.ATTENDANCE_ERROR,
        message: 'Failed to fetch attendance status',
      });
    }

    // Construct the response using the new structure
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
        shift: attendanceStatus.context.shift,
        schedule: {
          isHoliday: attendanceStatus.context.schedule.isHoliday,
          isDayOff: attendanceStatus.context.schedule.isDayOff,
          isAdjusted: attendanceStatus.context.schedule.isAdjusted,
          holidayInfo: attendanceStatus.context.schedule.holidayInfo,
        },
        nextPeriod: attendanceStatus.context.nextPeriod,
        transition: attendanceStatus.context.transition,
      },
      validation: {
        allowed: attendanceStatus.validation.allowed,
        reason: attendanceStatus.validation.reason,
        flags: {
          ...attendanceStatus.validation.flags,
          hasPendingTransition: attendanceStatus.daily.transitions.length > 0,
        },
        metadata: attendanceStatus.validation.metadata,
      },
    };

    // Cache the response
    if (cacheManager) {
      await cacheManager.cacheAttendanceState(employeeId, response);
    }

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

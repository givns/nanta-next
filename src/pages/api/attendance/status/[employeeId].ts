//api/attendance/status/[employeeId].ts
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { initializeServices } from '@/services/ServiceInitializer';
import {
  AttendanceBaseResponse,
  AttendanceState,
  CheckStatus,
  ShiftWindowResponse,
  ValidationResponse,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { NextApiRequest, NextApiResponse } from 'next';
import { addDays, endOfDay, format, parseISO, startOfDay } from 'date-fns';
import { raw } from '@prisma/client/runtime/library';

// Initialize services
const prisma = new PrismaClient();
const services = initializeServices(prisma);
const attendanceService = new AttendanceService(
  prisma,
  services.shiftService,
  services.holidayService,
  services.leaveService,
  services.overtimeService,
  services.notificationService,
  services.timeEntryService,
);

export interface AttendanceResponse {
  status: AttendanceBaseResponse;
  window: ShiftWindowResponse;
  validation?: ValidationResponse;
  timestamp: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AttendanceResponse | { error: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employeeId } = req.query;
  const { inPremises, address, confidence } = req.query as {
    inPremises?: string;
    address?: string;
    confidence?: string;
  };

  console.log('Request:', { employeeId, inPremises, address, confidence });

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ error: 'Invalid employeeId' });
  }

  try {
    const now = getCurrentTime();
    console.log(now);
    console.log('API Request for employeeId:', employeeId);

    // Verify user and shift existence first
    const user = await prisma.user.findUnique({
      where: { employeeId },
      select: {
        employeeId: true,
        shiftCode: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.shiftCode) {
      return res.status(400).json({
        error:
          'Shift configuration error: No shift code assigned to user. Please contact HR.',
      });
    }

    // Get base attendance status and window in parallel
    const [status, window, validation] = await Promise.all([
      attendanceService.getBaseStatus(employeeId),
      services.shiftService.getCurrentWindow(employeeId, now),
      inPremises
        ? attendanceService.validateCheckInOut(
            employeeId,
            inPremises === 'true',
            address || '',
          )
        : undefined,
    ]);

    console.log('API Data:', {
      rawStatus: status,
      rawWindow: window,
      rawValidation: validation,
    });

    // Special handling for day off with overtime
    if (window?.isDayOff && window.overtimeInfo) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.endTime}`,
      );

      window.current = {
        start: overtimeStart,
        end: overtimeEnd,
      };
    } else if (window?.isDayOff) {
      // For day off without overtime, use full day
      window.current = {
        start: startOfDay(now),
        end: endOfDay(now),
      };
    } else if (window?.overtimeInfo) {
      // Handle regular day overtime
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
      );
      let overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.endTime}`,
      );

      // Handle overnight case
      if (overtimeEnd < overtimeStart) {
        overtimeEnd = addDays(overtimeEnd, 1);
      }

      window.current = {
        start: overtimeStart,
        end: overtimeEnd,
      };
    }

    // Ensure status has all required fields with defaults
    const normalizedStatus: AttendanceBaseResponse = {
      state: status?.state || AttendanceState.ABSENT,
      checkStatus: status?.checkStatus || CheckStatus.PENDING,
      isCheckingIn: status?.isCheckingIn ?? true,
      latestAttendance: status?.latestAttendance || {
        CheckInTime: undefined,
        CheckOutTime: undefined,
        isLateCheckIn: false,
        isOvertime: false,
      },
    };

    console.log('Normalized Status:', normalizedStatus);

    if (!window) {
      return res.status(400).json({
        error:
          'Shift configuration error: Unable to calculate shift window. Please contact HR.',
      });
    }

    // Cache headers for short-term caching
    res.setHeader('Cache-Control', 'private, max-age=30'); // 30 seconds

    return res.status(200).json({
      status: normalizedStatus,
      window,
      validation,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Attendance status error:', {
      error,
      employeeId,
      timestamp: new Date().toISOString(),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Specific error handling
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }
      if (error.message.includes('validation')) {
        return res.status(400).json({ error: error.message });
      }
      if (error.message.includes('permission')) {
        return res.status(403).json({ error: error.message });
      }
      if (
        error.message.includes('startTime') ||
        error.message.includes('shift')
      ) {
        return res.status(400).json({
          error: 'Shift configuration error. Please contact HR.',
        });
      }
    }

    // Generic error
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  } finally {
    await prisma.$disconnect();
  }
}

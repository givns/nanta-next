import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { initializeServices } from '@/services/ServiceInitializer';
import {
  AttendanceBaseResponse,
  ShiftWindowResponse,
  ValidationResponse,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { NextApiRequest, NextApiResponse } from 'next';

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

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ error: 'Invalid employeeId' });
  }

  try {
    const now = getCurrentTime();

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
    const [status, window] = await Promise.all([
      attendanceService.getBaseStatus(employeeId),
      services.shiftService.getCurrentWindow(employeeId, now),
    ]);

    if (!window) {
      return res.status(400).json({
        error:
          'Shift configuration error: Unable to calculate shift window. Please contact HR.',
      });
    }

    // Only get validation if location is provided
    const validation = inPremises
      ? await attendanceService.validateCheckInOut(
          employeeId,
          inPremises === 'true',
          address || '',
        )
      : undefined;

    // Cache headers for short-term caching
    res.setHeader('Cache-Control', 'private, max-age=30'); // 30 seconds

    return res.status(200).json({
      status,
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

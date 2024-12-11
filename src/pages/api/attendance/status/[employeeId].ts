import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { initializeServices } from '@/services/ServiceInitializer';
import {
  AttendanceBaseResponse,
  AttendanceState,
  CheckStatus,
  ShiftWindowResponse,
  ValidationResponse,
  EnhancedAttendanceStatus,
  PeriodType,
  Period,
  AttendanceRecord,
  ApprovedOvertimeInfo,
  ValidationResponseWithMetadata,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceEnhancementService } from '@/services/Attendance/utils/AttendanceEnhancementService';
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

// Create instance of AttendanceEnhancementService
const enhancementService = new AttendanceEnhancementService(
  services.timeEntryService,
);

export interface AttendanceResponse {
  status: AttendanceBaseResponse;
  window: ShiftWindowResponse;
  validation?: ValidationResponseWithMetadata;
  enhanced: EnhancedAttendanceStatus;
  timestamp: string;
}

export interface ExtendedShiftWindowResponse extends ShiftWindowResponse {
  pendingTransitions?: Array<{
    from: PeriodType;
    to: PeriodType;
    transitionTime: Date;
    isCompleted: boolean;
  }>;
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
        error: 'Shift configuration error: No shift code assigned to user.',
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

    if (!window) {
      return res.status(400).json({
        error: 'Shift configuration error: Unable to calculate shift window.',
      });
    }

    // Create current period object with isOvernight check
    const currentPeriod: Period | null = window.current
      ? {
          type: window.type as PeriodType,
          startTime: new Date(window.current.start),
          endTime: new Date(window.current.end),
          isOvertime: window.type === PeriodType.OVERTIME,
          overtimeId: window.overtimeInfo?.id,
          isOvernight: window.overtimeInfo
            ? window.overtimeInfo.endTime < window.overtimeInfo.startTime // Check if end is before start in time string
            : window.current.end < window.current.start, // Fallback for regular shifts
        }
      : null;

    // Add type guard
    const isValidLatestAttendance = (
      attendance: any,
    ): attendance is AttendanceRecord => {
      return attendance && attendance.date !== undefined;
    };

    const mappedOvertimeInfo = window?.overtimeInfo
      ? ({
          id: window.overtimeInfo.id,
          employeeId: employeeId,
          date: new Date(window.current.start),
          startTime: window.overtimeInfo.startTime,
          endTime: window.overtimeInfo.endTime,
          durationMinutes: window.overtimeInfo.durationMinutes,
          status: 'approved' as const,
          employeeResponse: null,
          reason: window.overtimeInfo.reason || null,
          approverId: null,
          isDayOffOvertime: window.overtimeInfo.isDayOffOvertime,
          isInsideShiftHours: window.overtimeInfo.isInsideShiftHours,
        } as ApprovedOvertimeInfo)
      : null;

    const enhancedStatus = await enhancementService.enhanceAttendanceStatus(
      isValidLatestAttendance(status?.latestAttendance)
        ? status.latestAttendance
        : null,
      currentPeriod,
      mappedOvertimeInfo,
    );

    const defaultValidation: ValidationResponseWithMetadata = {
      allowed: false,
      reason: 'Default validation',
      flags: {
        isLateCheckIn: false,
        isEarlyCheckOut: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        isOvertime: false,
        requireConfirmation: false,
        isDayOffOvertime: false,
        isInsideShift: false,
        isAutoCheckIn: false,
        isAutoCheckOut: false,
      },
    };

    // Modify validation handling
    const modifiedValidation: ValidationResponseWithMetadata = validation
      ? {
          allowed: validation.allowed,
          reason: validation.reason,
          flags: {
            isLateCheckIn: validation.flags?.isLateCheckIn || false,
            isEarlyCheckOut: validation.flags?.isEarlyCheckOut || false,
            isPlannedHalfDayLeave:
              validation.flags?.isPlannedHalfDayLeave || false,
            isEmergencyLeave: validation.flags?.isEmergencyLeave || false,
            isOvertime: validation.flags?.isOvertime || false,
            requireConfirmation: validation.flags?.requireConfirmation || false,
            isDayOffOvertime: validation.flags?.isDayOffOvertime || false,
            isInsideShift: validation.flags?.isInsideShift || false,
            isAutoCheckIn: enhancedStatus.missingEntries.some(
              (e: { type: string }) => e.type === 'check-in',
            ),
            isAutoCheckOut: enhancedStatus.missingEntries.some(
              (e: { type: string }) => e.type === 'check-out',
            ),
          },
          metadata: {
            missingEntries: enhancedStatus.missingEntries,
          },
        }
      : defaultValidation;

    // Create modified window with transitions
    const modifiedWindow: ExtendedShiftWindowResponse = {
      ...window,
      pendingTransitions: enhancedStatus.pendingTransitions,
    };

    // First fix API response
    const normalizedStatus: AttendanceBaseResponse = {
      state: status?.state || AttendanceState.ABSENT,
      checkStatus: status?.checkStatus || CheckStatus.PENDING,
      isCheckingIn: status?.isCheckingIn ?? true,
      latestAttendance: status?.latestAttendance
        ? {
            date: status.latestAttendance.date,
            CheckInTime: status.latestAttendance.CheckInTime,
            CheckOutTime: status.latestAttendance.CheckOutTime,
            state: status.latestAttendance.state || AttendanceState.ABSENT,
            checkStatus:
              status.latestAttendance.checkStatus || CheckStatus.PENDING,
            overtimeState: status.latestAttendance.overtimeState,
            isLateCheckIn: status.latestAttendance.isLateCheckIn || false,
            isOvertime: status.latestAttendance.isOvertime || false,
            isManualEntry: status.latestAttendance.isManualEntry || false,
            isDayOff: status.latestAttendance.isDayOff || false,
            shiftStartTime: status.latestAttendance.shiftStartTime,
            shiftEndTime: status.latestAttendance.shiftEndTime,
          }
        : undefined,
    };

    // Cache headers for short-term caching
    res.setHeader('Cache-Control', 'private, max-age=30');

    return res.status(200).json({
      status: normalizedStatus,
      window: modifiedWindow,
      validation: modifiedValidation,
      enhanced: enhancedStatus,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error('Attendance status error:', {
      error,
      employeeId,
      timestamp: new Date().toISOString(),
      stack: error instanceof Error ? error.stack : undefined,
    });

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

    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  } finally {
    await prisma.$disconnect();
  }
}

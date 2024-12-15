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
  ATTENDANCE_CONSTANTS,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceEnhancementService } from '@/services/Attendance/AttendanceEnhancementService';
import {
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
  addMinutes,
} from 'date-fns';
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
const enhancementService = new AttendanceEnhancementService();

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

    // 1. Modified parallel data fetching
    const [baseStatus, window, baseValidation] = await Promise.all([
      attendanceService.getBaseStatus(employeeId),
      services.shiftService.getCurrentWindow(employeeId, now),
      attendanceService.validateCheckInOut(
        employeeId,
        inPremises === 'true',
        address || '',
      ),
    ]);

    if (!window) {
      return res.status(400).json({
        error: 'Shift configuration error: Unable to calculate shift window.',
      });
    }

    // Check for early overtime period
    let effectiveWindow = { ...window };
    let effectivePeriod = null;

    if (
      window.nextPeriod?.type === 'overtime' &&
      window.nextPeriod.overtimeInfo
    ) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.nextPeriod.overtimeInfo.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.nextPeriod.overtimeInfo.endTime}`,
      );
      const earlyWindow = subMinutes(
        overtimeStart,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      );

      if (isWithinInterval(now, { start: earlyWindow, end: overtimeEnd })) {
        effectiveWindow = {
          ...window,
          type: PeriodType.OVERTIME,
          current: {
            start: overtimeStart.toISOString(),
            end: overtimeEnd.toISOString(),
          },
          overtimeInfo: window.nextPeriod.overtimeInfo,
          nextPeriod: null,
        };

        effectivePeriod = {
          type: PeriodType.OVERTIME,
          startTime: overtimeStart,
          endTime: overtimeEnd,
          isOvertime: true,
          overtimeId: window.nextPeriod.overtimeInfo.id,
          isOvernight:
            window.nextPeriod.overtimeInfo.endTime <
            window.nextPeriod.overtimeInfo.startTime,
        };
      }
    }

    if (!effectivePeriod) {
      effectivePeriod = {
        type: window.type as PeriodType,
        startTime: new Date(window.current.start),
        endTime: new Date(window.current.end),
        isOvertime: window.type === PeriodType.OVERTIME,
        overtimeId: window.overtimeInfo?.id,
        isOvernight: window.overtimeInfo
          ? window.overtimeInfo.endTime < window.overtimeInfo.startTime
          : window.current.end < window.current.start,
      };
    }

    // 2. Better period handling with transition awareness
    const nextPeriodStart = effectiveWindow.nextPeriod
      ? parseISO(
          `${format(now, 'yyyy-MM-dd')}T${effectiveWindow.nextPeriod.startTime}`,
        )
      : null;

    const isNearTransition =
      nextPeriodStart &&
      isWithinInterval(now, {
        start: subMinutes(nextPeriodStart, 15),
        end: addMinutes(nextPeriodStart, 30),
      });

    // 3. Create current period with transition awareness
    const currentPeriod: Period = {
      type: window.type as PeriodType,
      startTime: new Date(window.current.start),
      endTime: new Date(window.current.end),
      isOvertime: window.type === PeriodType.OVERTIME,
      overtimeId: window.overtimeInfo?.id,
      isOvernight: window.overtimeInfo
        ? window.overtimeInfo.endTime < window.overtimeInfo.startTime
        : window.current.end < window.current.start,
    };
    console.log;
    ('currentPeriod from API');
    currentPeriod;

    // 4. Map overtime info with proper handling
    const mappedOvertimeInfo = effectiveWindow.overtimeInfo
      ? ({
          id: effectiveWindow.overtimeInfo.id,
          employeeId: employeeId,
          date: new Date(effectiveWindow.current.start),
          startTime: effectiveWindow.overtimeInfo.startTime,
          endTime: effectiveWindow.overtimeInfo.endTime,
          durationMinutes: effectiveWindow.overtimeInfo.durationMinutes,
          status: 'approved' as const,
          employeeResponse: null,
          reason: effectiveWindow.overtimeInfo.reason || null,
          approverId: null,
          isDayOffOvertime: effectiveWindow.overtimeInfo.isDayOffOvertime,
          isInsideShiftHours: effectiveWindow.overtimeInfo.isInsideShiftHours,
        } as ApprovedOvertimeInfo)
      : null;

    // First, map baseStatus.latestAttendance to proper AttendanceRecord type
    const mappedLatestAttendance = baseStatus?.latestAttendance
      ? ({
          id: baseStatus.latestAttendance.id || '', // Required field
          employeeId: employeeId, // We have this from params
          date: new Date(baseStatus.latestAttendance.date), // Convert string to Date
          state: baseStatus.latestAttendance.state || AttendanceState.ABSENT,
          checkStatus:
            baseStatus.latestAttendance.checkStatus || CheckStatus.PENDING,
          isOvertime: baseStatus.latestAttendance.isOvertime || false,
          isEarlyCheckIn: baseStatus.latestAttendance.isEarlyCheckIn || false,
          isLateCheckIn: baseStatus.latestAttendance.isLateCheckIn || false,
          isLateCheckOut: baseStatus.latestAttendance.isLateCheckOut || false,
          isVeryLateCheckOut: false,
          lateCheckOutMinutes: 0,
          CheckInTime: baseStatus.latestAttendance.CheckInTime
            ? new Date(baseStatus.latestAttendance.CheckInTime)
            : null,
          CheckOutTime: baseStatus.latestAttendance.CheckOutTime
            ? new Date(baseStatus.latestAttendance.CheckOutTime)
            : null,
          checkInLocation: null,
          checkOutLocation: null,
          checkInAddress: null,
          checkOutAddress: null,
          isManualEntry: baseStatus.latestAttendance.isManualEntry || false,
          overtimeState: baseStatus.latestAttendance.overtimeState,
          shiftStartTime: baseStatus.latestAttendance.shiftStartTime
            ? new Date(baseStatus.latestAttendance.shiftStartTime)
            : null,
          shiftEndTime: baseStatus.latestAttendance.shiftEndTime
            ? new Date(baseStatus.latestAttendance.shiftEndTime)
            : null,
          timeEntries: [],
          overtimeEntries: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as AttendanceRecord)
      : null;

    const enhancedStatus = await enhancementService.enhanceAttendanceStatus(
      mappedLatestAttendance,
      effectivePeriod,
      mappedOvertimeInfo,
    );

    const modifiedValidation: ValidationResponseWithMetadata = {
      allowed: baseValidation?.allowed ?? false,
      reason:
        effectiveWindow.nextPeriod?.type === 'overtime' &&
        effectiveWindow.nextPeriod.overtimeInfo
          ? `ไม่สามารถลงเวลาเข้างานล่วงเวลาได้ก่อนเวลา ${format(
              subMinutes(
                parseISO(
                  `${format(now, 'yyyy-MM-dd')}T${effectiveWindow.nextPeriod.overtimeInfo.startTime}`,
                ),
                ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
              ),
              'HH:mm',
            )} น.`
          : baseValidation?.reason || 'Default validation',
      flags: {
        ...baseValidation?.flags,
        isOvertime: Boolean(
          effectivePeriod.type === PeriodType.OVERTIME ||
            (isNearTransition &&
              effectiveWindow.nextPeriod?.type === 'overtime'),
        ),
        isAutoCheckIn: enhancedStatus.missingEntries.some(
          (e) => e.type === 'check-in',
        ),
        isAutoCheckOut: enhancedStatus.missingEntries.some(
          (e) => e.type === 'check-out',
        ),
        requireConfirmation:
          isNearTransition ||
          baseValidation?.flags?.requireConfirmation ||
          false,
      },
      metadata: {
        missingEntries: enhancedStatus.missingEntries,
        ...(isNearTransition && nextPeriodStart
          ? {
              transitionWindow: {
                start: subMinutes(nextPeriodStart, 15).toISOString(),
                end: addMinutes(nextPeriodStart, 30).toISOString(),
                targetPeriod: effectiveWindow.nextPeriod?.type as PeriodType,
              },
            }
          : {}),
      },
    };

    // 7. Modified window response
    const modifiedWindow: ExtendedShiftWindowResponse = {
      ...effectiveWindow,
      pendingTransitions: [...enhancedStatus.pendingTransitions],
    };

    // 8. Normalized status with better transition handling
    const normalizedStatus: AttendanceBaseResponse = {
      state:
        effectivePeriod.type === PeriodType.OVERTIME
          ? AttendanceState.OVERTIME
          : baseStatus?.state || AttendanceState.ABSENT,
      checkStatus: baseStatus?.checkStatus || CheckStatus.PENDING,
      isCheckingIn: baseStatus?.isCheckingIn ?? true,
      latestAttendance: baseStatus?.latestAttendance
        ? {
            id: baseStatus.latestAttendance.id,
            employeeId: baseStatus.latestAttendance.employeeId,
            date: baseStatus.latestAttendance.date,
            CheckInTime: baseStatus.latestAttendance.CheckInTime,
            CheckOutTime: baseStatus.latestAttendance.CheckOutTime,
            state:
              effectivePeriod.type === PeriodType.OVERTIME
                ? AttendanceState.OVERTIME
                : baseStatus.latestAttendance.state || AttendanceState.ABSENT,
            checkStatus:
              baseStatus.latestAttendance.checkStatus || CheckStatus.PENDING,
            overtimeState: baseStatus.latestAttendance.overtimeState,
            isLateCheckIn: baseStatus.latestAttendance.isLateCheckIn || false,
            isOvertime: effectivePeriod.type === PeriodType.OVERTIME,
            isManualEntry: baseStatus.latestAttendance.isManualEntry || false,
            isDayOff: baseStatus.latestAttendance.isDayOff || false,
            shiftStartTime: baseStatus.latestAttendance.shiftStartTime,
            shiftEndTime: baseStatus.latestAttendance.shiftEndTime,
          }
        : undefined,
    };

    // Cache headers for short-term caching
    res.setHeader('Cache-Control', 'private, max-age=30');

    console.log({
      status: normalizedStatus,
      window: modifiedWindow,
      validation: modifiedValidation,
      enhanced: enhancedStatus,
      timestamp: now.toISOString(),
    });

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

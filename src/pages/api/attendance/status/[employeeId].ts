import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, OvertimeState } from '@prisma/client';
import { z } from 'zod';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { AttendanceEnhancementService } from '@/services/Attendance/AttendanceEnhancementService';
import { PeriodManagementService } from '@/services/Attendance/PeriodManagementService';
import { AttendanceMappers } from '@/services/Attendance/utils/AttendanceMappers';
import { initializeServices } from '@/services/ServiceInitializer';
import {
  AppError,
  AttendanceBaseResponse,
  AttendanceRecord,
  AttendanceStatusResponse,
  ErrorCode,
  PeriodType,
  Period,
  PeriodStatus,
  PeriodWindow,
  OvertimeContext,
  ApprovedOvertimeInfo,
  ValidationResponse,
  ShiftWindowResponse,
  TimelineEnhancement,
  ValidationEnhancement,
  ATTENDANCE_CONSTANTS,
  AttendanceFlags,
  PeriodValidation,
  EnhancedAttendanceStatus,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  addMinutes,
  format,
  isWithinInterval,
  parseISO,
  subMinutes,
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

function convertPeriodWindowToPeriod(window: PeriodWindow): Period {
  return {
    type: window.type,
    startTime: window.start,
    endTime: window.end,
    isOvertime: window.type === PeriodType.OVERTIME,
    overtimeId: window.overtimeId,
    isOvernight: window.end < window.start,
    status: window.status,
    isConnected: window.isConnected,
    isDayOffOvertime: false,
  };
}

function checkIfEarlyForPeriod(
  period: Period | undefined | null,
  now: Date,
): boolean {
  if (!period) return false;
  return (
    period.status === PeriodStatus.PENDING &&
    isWithinInterval(now, {
      start: subMinutes(
        period.startTime,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      ),
      end: period.startTime,
    })
  );
}

function checkIfLateForPeriod(
  period: Period | undefined | null,
  now: Date,
): boolean {
  if (!period) return false;
  return (
    period.status === PeriodStatus.ACTIVE &&
    isWithinInterval(now, {
      start: period.startTime,
      end: addMinutes(
        period.startTime,
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
      ),
    })
  );
}

function mapToApprovedOvertime(
  overtimeInfo: OvertimeContext,
  now: Date,
): ApprovedOvertimeInfo {
  return {
    id: overtimeInfo.id,
    employeeId: '',
    date: now,
    startTime: overtimeInfo.startTime,
    endTime: overtimeInfo.endTime,
    durationMinutes: overtimeInfo.durationMinutes,
    status: 'approved',
    employeeResponse: null,
    approverId: null,
    isDayOffOvertime: overtimeInfo.isDayOffOvertime,
    isInsideShiftHours: overtimeInfo.isInsideShiftHours,
    reason: overtimeInfo.reason || null,
  };
}

function ensureLatestAttendance(
  baseStatus: AttendanceBaseResponse,
): AttendanceStatusResponse['base'] {
  return {
    state: baseStatus.state,
    checkStatus: baseStatus.checkStatus,
    isCheckingIn: baseStatus.isCheckingIn,
    latestAttendance: baseStatus.latestAttendance || null,
  };
}

function createTimelineEnhancement(
  periods: Period[],
  records: AttendanceRecord[],
  now: Date,
): TimelineEnhancement {
  return {
    currentPeriodIndex: periods.findIndex(
      (p) => p.status === PeriodStatus.ACTIVE,
    ),
    periodEntries: periods.map((period) => {
      const record = records.find((r) => r.type === period.type);
      return {
        periodType: period.type,
        startTime: period.startTime.toISOString(),
        endTime: period.endTime.toISOString(),
        checkInTime: record?.CheckInTime?.toISOString(),
        checkOutTime: record?.CheckOutTime?.toISOString(),
        status: period.status,
      };
    }),
  };
}

function createPeriodValidation(
  timeline: TimelineEnhancement,
  enhancedValidation: ValidationEnhancement,
  baseValidation: ValidationResponse,
  enhanced: EnhancedAttendanceStatus,
): PeriodValidation {
  return {
    currentPeriod: {
      index: timeline.currentPeriodIndex,
      canCheckIn: baseValidation.allowed && timeline.currentPeriodIndex === -1,
      canCheckOut: baseValidation.allowed && timeline.currentPeriodIndex !== -1,
      requiresTransition: enhanced.pendingTransitions.length > 0,
      message: baseValidation.reason,
      enhancement: {
        isWithinPeriod: enhancedValidation.periodValidation.isWithinPeriod,
        isEarlyForPeriod: enhancedValidation.periodValidation.isEarlyForPeriod,
        isLateForPeriod: enhancedValidation.periodValidation.isLateForPeriod,
        periodStart:
          enhancedValidation.periodValidation.periodStart.toISOString(),
        periodEnd: enhancedValidation.periodValidation.periodEnd.toISOString(),
        status: determineEnhancementStatus(
          timeline.currentPeriodIndex,
          enhanced,
        ),
      },
    },
    nextPeriod: enhanced.pendingTransitions[0]
      ? {
          index: timeline.currentPeriodIndex + 1,
          availableAt:
            enhanced.pendingTransitions[0].transitionTime.toISOString(),
          type: enhanced.pendingTransitions[0].to,
        }
      : undefined,
  };
}

function determineEnhancementStatus(
  currentPeriodIndex: number,
  enhanced: EnhancedAttendanceStatus,
): 'active' | 'pending' | 'completed' {
  if (currentPeriodIndex === -1) {
    return 'pending';
  }

  if (enhanced.lastCheckOut) {
    return 'completed';
  }

  if (enhanced.lastCheckIn) {
    return 'active';
  }

  return 'pending';
}

function createEnhancedValidation(
  enhanced: EnhancedAttendanceStatus,
  periods: Period[],
  records: AttendanceRecord[],
  now: Date,
): ValidationEnhancement {
  const currentPeriod = periods.find((p) => p.status === PeriodStatus.ACTIVE);

  return {
    autoCompletionRequired: enhanced.missingEntries.length > 0,
    pendingTransitionValidation: {
      canTransition: enhanced.pendingTransitions.length > 0,
      reason:
        enhanced.pendingTransitions.length > 0
          ? 'Period transition required'
          : undefined,
      nextPeriodStart: enhanced.pendingTransitions[0]?.transitionTime,
    },
    periodValidation: {
      isWithinPeriod: currentPeriod?.status === PeriodStatus.ACTIVE,
      isEarlyForPeriod: checkIfEarlyForPeriod(currentPeriod, now),
      isLateForPeriod: checkIfLateForPeriod(currentPeriod, now),
      periodStart: currentPeriod?.startTime ?? now,
      periodEnd: currentPeriod?.endTime ?? now,
    },
  };
}

function createValidationFlags(
  baseValidation: ValidationResponse,
  baseStatus: AttendanceBaseResponse,
  enhancedValidation: ValidationEnhancement,
  context: { now: Date; window: ShiftWindowResponse },
  isInTransition: boolean,
): AttendanceFlags {
  return {
    ...baseValidation.flags,
    hasActivePeriod: Boolean(
      baseStatus.latestAttendance?.CheckInTime &&
        !baseStatus.latestAttendance?.CheckOutTime,
    ),
    hasPendingTransition: isInTransition,
    isInsideShift: Boolean(
      baseStatus.latestAttendance?.shiftStartTime &&
        isWithinInterval(context.now, {
          start: new Date(baseStatus.latestAttendance.shiftStartTime),
          end: new Date(baseStatus.latestAttendance.shiftEndTime || ''),
        }),
    ),
    isEarlyCheckIn: enhancedValidation.periodValidation.isEarlyForPeriod,
    isAutoCheckIn: false,
    isAutoCheckOut: false,
    isOvertime: isInTransition
      ? false
      : context.window.type === PeriodType.OVERTIME,
    isPendingDayOffOvertime: false,
    isPendingOvertime: false,
    isOutsideShift: false,
    isLate: false,
    isEarlyCheckOut: false,
    isLateCheckIn: false,
    isLateCheckOut: enhancedValidation.periodValidation.isLateForPeriod,
    isVeryLateCheckOut: false,
    isAfternoonShift: false,
    isMorningShift: false,
    isAfterMidshift: false,
    isApprovedEarlyCheckout: false,
    isPlannedHalfDayLeave: false,
    isEmergencyLeave: false,
    requiresAutoCompletion: false,
    isHoliday: false,
    isDayOff: false,
    isManualEntry: false,
  };
}

function mapEnhancedResponse(
  baseStatus: AttendanceBaseResponse,
  enhanced: EnhancedAttendanceStatus,
  periods: Period[],
  timeline: TimelineEnhancement,
  enhancedValidation: ValidationEnhancement,
  context: {
    records: AttendanceRecord[];
    window: ShiftWindowResponse;
    baseValidation: ValidationResponse;
    now: Date;
  },
): AttendanceStatusResponse {
  const periodManager = new PeriodManagementService();

  const isInTransition = Boolean(
    context.window.nextPeriod?.overtimeInfo &&
      isWithinInterval(context.now, {
        start: subMinutes(
          parseISO(
            `${format(context.now, 'yyyy-MM-dd')}T${context.window.nextPeriod.overtimeInfo.startTime}`,
          ),
          30,
        ),
        end: parseISO(
          `${format(context.now, 'yyyy-MM-dd')}T${context.window.nextPeriod.overtimeInfo.startTime}`,
        ),
      }),
  );

  const periodValidation = createPeriodValidation(
    timeline,
    enhancedValidation,
    context.baseValidation,
    enhanced,
  );

  const flags = createValidationFlags(
    context.baseValidation,
    baseStatus,
    enhancedValidation,
    context,
    isInTransition,
  );

  return {
    daily: {
      date: format(context.now, 'yyyy-MM-dd'),
      timeline,
      periods: periods.map((period) => ({
        type: period.type,
        window: {
          start: period.startTime.toISOString(),
          end: period.endTime.toISOString(),
        },
        status: {
          isComplete: period.status === PeriodStatus.COMPLETED,
          isCurrent: period.status === PeriodStatus.ACTIVE,
          requiresTransition: enhanced.pendingTransitions.length > 0,
        },
      })),
      transitions: periodManager.calculateTransitions(periods)[0] || null,
    },
    base: ensureLatestAttendance(baseStatus),
    window: context.window,
    validation: {
      allowed: context.baseValidation.allowed,
      reason: context.baseValidation.reason,
      flags,
      periodValidation,
    },
    enhanced,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const validatedParams = QuerySchema.safeParse(req.query);
    if (!validatedParams.success) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
      });
    }

    const { employeeId, inPremises, address } = validatedParams.data;
    const now = getCurrentTime();

    const periodManager = new PeriodManagementService();
    const enhancementService = new AttendanceEnhancementService();

    const [baseStatus, window, baseValidation] = await Promise.all([
      attendanceService.getBaseStatus(employeeId),
      services.shiftService.getCurrentWindow(employeeId, now),
      attendanceService.validateCheckInOut(employeeId, inPremises, address),
    ]);

    if (!window) {
      throw new AppError({
        code: ErrorCode.SHIFT_DATA_ERROR,
        message: 'Shift configuration not found',
      });
    }

    const regularPeriod = periodManager.createPeriodFromWindow(window);
    const overtimePeriod = window.overtimeInfo
      ? periodManager.createOvertimePeriod(window.overtimeInfo, now)
      : null;

    const currentPeriod = periodManager.determineCurrentPeriod(
      now,
      [regularPeriod, overtimePeriod].filter((p): p is Period => p !== null),
    );

    const dailyPeriods = periodManager.getDailyPeriods(
      [regularPeriod, overtimePeriod].filter((p): p is Period => p !== null),
    );

    const periods = dailyPeriods.periods.map(convertPeriodWindowToPeriod);
    const records = await Promise.all(
      periods.map((period) =>
        attendanceService
          .getAttendanceForPeriod(employeeId, period)
          .catch(() => null),
      ),
    ).then((results) =>
      results.filter((r): r is AttendanceRecord => r !== null),
    );

    const timeline = createTimelineEnhancement(periods, records, now);
    const enhancedStatus = await enhancementService.enhanceAttendanceStatus(
      baseStatus?.latestAttendance
        ? AttendanceMappers.toAttendanceRecord(baseStatus.latestAttendance)
        : null,
      currentPeriod,
      window.overtimeInfo
        ? mapToApprovedOvertime(window.overtimeInfo, now)
        : null,
    );

    const enhancedValidation = createEnhancedValidation(
      enhancedStatus,
      periods,
      records,
      now,
    );

    const response = mapEnhancedResponse(
      baseStatus,
      enhancedStatus,
      periods,
      timeline,
      enhancedValidation,
      { records, window, baseValidation, now },
    );

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
        details: error.errors.map((err) => ({
          message: err.message,
          path: err.path,
        })),
      });
    }

    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
      timestamp: getCurrentTime().toISOString(),
    });
  } finally {
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error('Error disconnecting from database:', disconnectError);
    }
  }
}

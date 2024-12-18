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
  // Find active record (checked in but not checked out)
  const activeRecord = records.find((r) => r.CheckInTime && !r.CheckOutTime);

  const activeIndex = activeRecord
    ? periods.findIndex((p) => p.type === activeRecord.type)
    : -1;

  return {
    currentPeriodIndex: activeIndex,
    periodEntries: periods.map((period) => {
      const record = records.find((r) => r.type === period.type);

      // If there's an active record, it takes precedence
      if (activeRecord && record?.id === activeRecord.id) {
        return {
          periodType: period.type,
          startTime: period.startTime.toISOString(),
          endTime: period.endTime.toISOString(),
          checkInTime: record.CheckInTime?.toISOString(),
          checkOutTime: record.CheckOutTime?.toISOString(),
          status: PeriodStatus.ACTIVE,
        };
      }

      return {
        periodType: period.type,
        startTime: period.startTime.toISOString(),
        endTime: period.endTime.toISOString(),
        checkInTime: record?.CheckInTime?.toISOString(),
        checkOutTime: record?.CheckOutTime?.toISOString(),
        status: record?.CheckOutTime
          ? PeriodStatus.COMPLETED
          : PeriodStatus.PENDING,
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
  const hasActiveCheckIn = Boolean(
    enhanced.lastCheckIn && !enhanced.lastCheckOut,
  );

  return {
    currentPeriod: {
      index: hasActiveCheckIn ? 0 : -1,
      canCheckIn: baseValidation.allowed && !hasActiveCheckIn,
      canCheckOut: Boolean(baseValidation.allowed && hasActiveCheckIn),
      requiresTransition: enhanced.pendingTransitions.length > 0,
      message: baseValidation.reason,
      enhancement: {
        isWithinPeriod: enhancedValidation.periodValidation.isWithinPeriod,
        isEarlyForPeriod: enhancedValidation.periodValidation.isEarlyForPeriod,
        isLateForPeriod: enhancedValidation.periodValidation.isLateForPeriod,
        periodStart:
          enhancedValidation.periodValidation.periodStart.toISOString(),
        periodEnd: enhancedValidation.periodValidation.periodEnd.toISOString(),
        status: hasActiveCheckIn ? 'active' : 'pending',
      },
    },
    nextPeriod: enhanced.pendingTransitions[0]
      ? {
          index: hasActiveCheckIn ? 1 : 0,
          availableAt:
            enhanced.pendingTransitions[0].transitionTime.toISOString(),
          type: enhanced.pendingTransitions[0].to as PeriodType,
        }
      : undefined,
  };
}

function createEnhancedValidation(
  enhanced: EnhancedAttendanceStatus,
  periods: Period[],
  records: AttendanceRecord[],
  now: Date,
  window: ShiftWindowResponse, // Add window parameter
): ValidationEnhancement {
  const activeRecord = records.find((r) => r?.CheckInTime && !r?.CheckOutTime);
  const currentPeriod = activeRecord
    ? periods.find(
        (p) =>
          p.type === activeRecord.type &&
          isWithinInterval(now, {
            start: p.startTime,
            end: p.endTime,
          }),
      )
    : null;

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
      isWithinPeriod: Boolean(currentPeriod),
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
  const isActiveAttendance = Boolean(
    baseStatus.latestAttendance?.CheckInTime &&
      !baseStatus.latestAttendance?.CheckOutTime,
  );

  const isInShiftTime = isWithinInterval(context.now, {
    start: parseISO(
      `${format(context.now, 'yyyy-MM-dd')}T${context.window.shift.startTime}`,
    ),
    end: parseISO(
      `${format(context.now, 'yyyy-MM-dd')}T${context.window.shift.endTime}`,
    ),
  });

  return {
    ...baseValidation.flags,
    hasActivePeriod: isActiveAttendance,
    hasPendingTransition: isInTransition,
    isInsideShift: isActiveAttendance && isInShiftTime,
    isEarlyCheckIn: enhancedValidation.periodValidation.isEarlyForPeriod,
    isAutoCheckIn: false,
    isAutoCheckOut: false,
    isOvertime: context.window.type === PeriodType.OVERTIME,
    isPendingDayOffOvertime: false,
    isPendingOvertime: Boolean(context.window.nextPeriod?.type === 'overtime'),
    isOutsideShift: isActiveAttendance && !isInShiftTime,
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
  const hasActiveCheckIn = Boolean(
    baseStatus.latestAttendance?.CheckInTime &&
      !baseStatus.latestAttendance?.CheckOutTime,
  );

  // Check if we're in the current shift time
  const isInCurrentShift = isWithinInterval(context.now, {
    start: parseISO(context.window.current.start),
    end: parseISO(context.window.current.end),
  });

  // Determine transition state for overtime
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

  // Create transition object if applicable
  const transition = isInTransition
    ? {
        from: PeriodType.REGULAR, // Direct PeriodType
        to: PeriodType.OVERTIME, // Direct PeriodType
        transitionTime: parseISO(
          `${format(context.now, 'yyyy-MM-dd')}T${context.window.nextPeriod?.overtimeInfo?.startTime || ''}`,
        ).toISOString(), // Convert to string
        isComplete: false,
      }
    : null;

  // Update enhanced status
  const updatedEnhanced: EnhancedAttendanceStatus = {
    ...enhanced,
    currentPeriod:
      hasActiveCheckIn && isInCurrentShift
        ? {
            type: context.window.type,
            startTime: parseISO(context.window.current.start),
            endTime: parseISO(context.window.current.end),
            isOvertime: context.window.type === PeriodType.OVERTIME,
            status: PeriodStatus.ACTIVE,
            isOvernight: false,
            isConnected: Boolean(context.window.nextPeriod),
            isDayOffOvertime: false,
            overtimeId: context.window.nextPeriod?.overtimeInfo?.id, // Remove null, keep undefined
          }
        : null,
    lastCheckIn: baseStatus.latestAttendance?.CheckInTime
      ? {
          time: new Date(baseStatus.latestAttendance.CheckInTime),
          periodType: baseStatus.latestAttendance.periodType as PeriodType,
          isOvertime: Boolean(baseStatus.latestAttendance.isOvertime),
        }
      : null,
    lastCheckOut: baseStatus.latestAttendance?.CheckOutTime
      ? {
          time: new Date(baseStatus.latestAttendance.CheckOutTime),
          periodType: baseStatus.latestAttendance.periodType as PeriodType,
          isOvertime: Boolean(baseStatus.latestAttendance.isOvertime),
        }
      : null,
    pendingTransitions: isInTransition
      ? [
          {
            from: PeriodType.REGULAR,
            to: PeriodType.OVERTIME,
            transitionTime: parseISO(
              `${format(context.now, 'yyyy-MM-dd')}T${context.window.nextPeriod?.overtimeInfo?.startTime || ''}`,
            ),
            isComplete: false,
          },
        ]
      : [],
    missingEntries: enhanced.missingEntries,
  };

  // Update periods with current status
  const mappedPeriods = periods.map((period) => ({
    type: period.type,
    window: {
      start: period.startTime.toISOString(),
      end: period.endTime.toISOString(),
    },
    status: {
      isComplete: Boolean(period.status === PeriodStatus.COMPLETED),
      isCurrent: hasActiveCheckIn && period.type === context.window.type,
      requiresTransition: isInTransition,
    },
  }));

  // Create period validation
  const periodValidation = createPeriodValidation(
    {
      ...timeline,
      currentPeriodIndex: hasActiveCheckIn ? 0 : -1,
    },
    enhancedValidation,
    context.baseValidation,
    updatedEnhanced,
  );

  // Create validation flags
  const flags = createValidationFlags(
    context.baseValidation,
    baseStatus,
    enhancedValidation,
    {
      ...context,
      window: {
        ...context.window,
        current: {
          start: context.window.current.start,
          end: context.window.current.end,
        },
      },
    },
    isInTransition,
  );

  return {
    daily: {
      date: format(context.now, 'yyyy-MM-dd'),
      timeline: {
        ...timeline,
        currentPeriodIndex: hasActiveCheckIn ? 0 : -1,
      },
      periods: mappedPeriods,
      transitions: transition
        ? {
            from: {
              periodIndex: 0,
              type: transition.from,
            },
            to: {
              periodIndex: 0,
              type: transition.to,
            },
            transitionTime: transition.transitionTime,
            isComplete: transition.isComplete,
          }
        : null,
    },
    base: ensureLatestAttendance(baseStatus),
    window: context.window,
    validation: {
      allowed: context.baseValidation.allowed,
      reason: context.baseValidation.reason,
      flags: {
        ...flags,
        hasActivePeriod: hasActiveCheckIn,
        isInsideShift: hasActiveCheckIn && isInCurrentShift,
        hasPendingTransition: isInTransition,
      },
      periodValidation,
    },
    enhanced: updatedEnhanced,
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
      window,
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

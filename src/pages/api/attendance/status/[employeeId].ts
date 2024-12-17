// pages/api/attendance/status/[employeeId].ts

import { AttendanceEnhancementService } from '@/services/Attendance/AttendanceEnhancementService';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { PeriodManagementService } from '@/services/Attendance/PeriodManagementService';
import { AttendanceMappers } from '@/services/Attendance/utils/AttendanceMappers';
import { initializeServices } from '@/services/ServiceInitializer';
import {
  AttendanceStatusResponse,
  ATTENDANCE_CONSTANTS,
  AppError,
  AttendanceRecord,
  EnhancedAttendanceStatus,
  ErrorCode,
  Period,
  TimelineEnhancement,
  ValidationEnhancement,
  AttendanceBaseResponse,
  ShiftWindowResponse,
  ValidationResponse,
  PeriodAttendance,
  ApprovedOvertimeInfo,
  PeriodType,
  AttendanceFlags,
  PeriodTransition,
  OvertimePeriodInfo,
  AttendanceStateResponse,
  PeriodStatus,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { OvertimeState, PrismaClient } from '@prisma/client';
import {
  addMinutes,
  format,
  isAfter,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';
import { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

type ApiResponse =
  | AttendanceStatusResponse
  | {
      error: string;
      message?: string;
      details?: Array<{ message: string; path: string[] }>; // Add details to the error type
    };
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
    .transform((coords) => {
      if (coords.lat && coords.lng) {
        return {
          lat: Number(coords.lat),
          lng: Number(coords.lng),
        };
      }
      return undefined;
    })
    .optional(),
});

function mapEnhancedResponse(
  baseStatus: AttendanceBaseResponse,
  enhanced: EnhancedAttendanceStatus,
  allPeriods: Period[],
  timeline: TimelineEnhancement,
  enhancedValidation: ValidationEnhancement,
  context: {
    records: (AttendanceRecord | null)[];
    window: ShiftWindowResponse;
    baseValidation: ValidationResponse;
    now: Date;
  },
): AttendanceStatusResponse {
  const nonNullRecords = context.records.filter(
    (r): r is AttendanceRecord => r !== null,
  );

  // Map attendance record to PeriodAttendance
  const mapToPeriodAttendance = (
    record: AttendanceRecord,
  ): PeriodAttendance => ({
    id: record.id,
    checkInTime: record.CheckInTime?.toISOString() || null,
    checkOutTime: record.CheckOutTime?.toISOString() || null,
    state: record.state,
    checkStatus: record.checkStatus,
  });

  // Map overtime period
  const mapToOvertimePeriodInfo = (
    overtimeId: string,
    startTime: Date,
    endTime: Date,
    state: OvertimeState,
  ): OvertimePeriodInfo => ({
    id: overtimeId,
    startTime: format(startTime, 'HH:mm'),
    endTime: format(endTime, 'HH:mm'),
    status: state,
  });

  // Determine transition window
  const overtimeInfo = context.window.nextPeriod?.overtimeInfo;
  const isInTransition =
    overtimeInfo &&
    isWithinInterval(context.now, {
      start: subMinutes(
        parseISO(
          `${format(context.now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
        ),
        30,
      ),
      end: parseISO(
        `${format(context.now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
      ),
    });

  // Map periods according to interface
  const periods = allPeriods.map((period, index) => {
    const record = nonNullRecords.find((r) => r.type === period.type);
    const isCurrentPeriod =
      period.type === PeriodType.REGULAR &&
      record?.CheckInTime &&
      !record?.CheckOutTime;

    const periodEntry: AttendanceStateResponse['daily']['periods'][0] = {
      type: period.type,
      window: {
        start: period.startTime.toISOString(),
        end: period.endTime.toISOString(),
      },
      status: {
        isComplete: Boolean(record?.CheckOutTime),
        isCurrent: isCurrentPeriod,
        requiresTransition: false,
      },
    };

    // Add attendance if exists
    if (record) {
      periodEntry.attendance = mapToPeriodAttendance(record);
    }

    // Add overtime info if applicable
    if (period.type === PeriodType.OVERTIME && period.overtimeId) {
      periodEntry.overtime = mapToOvertimePeriodInfo(
        period.overtimeId,
        period.startTime,
        period.endTime,
        record?.overtimeState || OvertimeState.NOT_STARTED,
      );
    }

    return periodEntry;
  });

  // Add upcoming overtime period if exists and not already included
  if (
    context.window.nextPeriod?.overtimeInfo &&
    !periods.some((p) => p.type === PeriodType.OVERTIME)
  ) {
    const ot = context.window.nextPeriod.overtimeInfo;
    const otStart = parseISO(
      `${format(context.now, 'yyyy-MM-dd')}T${ot.startTime}`,
    );
    const otEnd = parseISO(
      `${format(context.now, 'yyyy-MM-dd')}T${ot.endTime}`,
    );

    periods.push({
      type: PeriodType.OVERTIME,
      window: {
        start: otStart.toISOString(),
        end: otEnd.toISOString(),
      },
      status: {
        isComplete: false,
        isCurrent: false,
        requiresTransition: false,
      },
      overtime: {
        id: ot.id,
        startTime: ot.startTime,
        endTime: ot.endTime,
        status: OvertimeState.NOT_STARTED,
      },
    });
  }

  // Create type-safe transition
  const transitions: PeriodTransition = {
    from: {
      periodIndex: 0, // Regular period is always first
      type: PeriodType.REGULAR,
    },
    to: {
      periodIndex: 1, // Overtime period is second
      type: PeriodType.OVERTIME,
    },
    transitionTime: parseISO(
      `${format(context.now, 'yyyy-MM-dd')}T${overtimeInfo?.startTime ?? ''}`,
    ).toISOString(),

    isComplete: false,
  };

  return {
    daily: {
      date: format(context.now, 'yyyy-MM-dd'),
      timeline,
      periods,
      transitions,
    },
    base: {
      state: baseStatus.state,
      checkStatus: baseStatus.checkStatus,
      isCheckingIn: baseStatus.isCheckingIn,
      latestAttendance: baseStatus.latestAttendance
        ? {
            ...baseStatus.latestAttendance,
            // Ensure null instead of undefined for nullable fields
            CheckInTime: baseStatus.latestAttendance.CheckInTime || null,
            CheckOutTime: baseStatus.latestAttendance.CheckOutTime || null,
            shiftStartTime:
              baseStatus.latestAttendance.shiftStartTime ?? undefined,
            shiftEndTime: baseStatus.latestAttendance.shiftEndTime ?? undefined,
            // Ensure boolean flags have default values
            isLateCheckIn: baseStatus.latestAttendance.isLateCheckIn || false,
            isLateCheckOut: baseStatus.latestAttendance.isLateCheckOut || false,
            isEarlyCheckIn: baseStatus.latestAttendance.isEarlyCheckIn || false,
            isOvertime: baseStatus.latestAttendance.isOvertime || false,
            isManualEntry: baseStatus.latestAttendance.isManualEntry || false,
            isDayOff: baseStatus.latestAttendance.isDayOff || false,
          }
        : null,
    },
    window: context.window,
    validation: {
      allowed: context.baseValidation.allowed,
      reason: context.baseValidation.reason,
      flags: {
        ...context.baseValidation.flags,
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
        isOvertime: isInTransition ? false : PeriodType.OVERTIME,
        requiresOvertimeCheckIn: isInTransition,
        isPendingDayOffOvertime: false,
        isPendingOvertime: false,
        isOutsideShift: false,
        isLate: false,
        isEarly: false,
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
      } as AttendanceFlags,
      periodValidation: {
        currentPeriod: {
          index: timeline.currentPeriodIndex,
          canCheckIn:
            context.baseValidation.allowed && !nonNullRecords[0]?.CheckInTime,
          canCheckOut:
            context.baseValidation.allowed && !!nonNullRecords[0]?.CheckInTime,
          requiresTransition: enhanced.pendingTransitions.length > 0,
          message: context.baseValidation.reason,
          enhancement: {
            isWithinPeriod: enhancedValidation.periodValidation.isWithinPeriod,
            isEarlyForPeriod:
              enhancedValidation.periodValidation.isEarlyForPeriod,
            isLateForPeriod:
              enhancedValidation.periodValidation.isLateForPeriod,
            periodStart:
              enhancedValidation.periodValidation.periodStart.toISOString(),
            periodEnd:
              enhancedValidation.periodValidation.periodEnd.toISOString(),
          },
        },
        nextPeriod: enhanced.pendingTransitions[0]
          ? {
              index: allPeriods.findIndex(
                (p) => p.type === enhanced.pendingTransitions[0].to,
              ),
              availableAt:
                enhanced.pendingTransitions[0].transitionTime.toISOString(),
              type: enhanced.pendingTransitions[0].to,
            }
          : undefined,
      },
    },
    enhanced,
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
) {
  console.log('Attendance status request:', {
    method: req.method,
    query: req.query,
    timestamp: getCurrentTime().toISOString(),
  });

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse and validate request parameters
    const validatedParams = QuerySchema.safeParse(req.query);
    if (!validatedParams.success) {
      console.error('Validation error:', validatedParams.error);
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
      });
    }

    const { employeeId, inPremises, address, coordinates, confidence } =
      validatedParams.data;

    const now = getCurrentTime();
    const periodManager = new PeriodManagementService();
    const enhancementService = new AttendanceEnhancementService();

    try {
      const [baseStatus, window, baseValidation] = await Promise.all([
        attendanceService.getBaseStatus(employeeId),
        services.shiftService.getCurrentWindow(employeeId, getCurrentTime()),
        attendanceService.validateCheckInOut(employeeId, inPremises, address),
      ]);

      if (!window) {
        throw new AppError({
          code: ErrorCode.SHIFT_DATA_ERROR,
          message: 'Shift configuration not found',
        });
      }

      // Rest of your existing logic stays the same
      const { effectiveWindow, effectivePeriod } =
        periodManager.determineEffectiveWindow(
          window,
          baseStatus,
          now,
          window.overtimeInfo,
        );

      const regularPeriod =
        effectivePeriod ||
        periodManager.createPeriodFromWindow(effectiveWindow);
      const overtimePeriod = effectiveWindow.overtimeInfo
        ? periodManager.createOvertimePeriod(effectiveWindow.overtimeInfo, now)
        : null;

      const validPeriods = [regularPeriod, overtimePeriod].filter(
        (p) => p !== null,
      );
      const allPeriods = periodManager.sortAndValidatePeriods(validPeriods);

      // 4. Get attendance records with error handling
      const records = await Promise.all(
        allPeriods.map((period) =>
          attendanceService
            .getAttendanceForPeriod(employeeId, period)
            .catch((error) => {
              console.error('Error fetching attendance record:', error);
              return null;
            }),
        ),
      );

      // Your existing mapping and enhancement logic...
      const mappedOvertimeInfo = effectiveWindow.overtimeInfo
        ? ({
            id: effectiveWindow.overtimeInfo.id,
            employeeId,
            date: now,
            startTime: effectiveWindow.overtimeInfo.startTime,
            endTime: effectiveWindow.overtimeInfo.endTime,
            status: 'approved' as const,
            employeeResponse: null,
            approverId: null,
            durationMinutes: effectiveWindow.overtimeInfo.durationMinutes,
            isDayOffOvertime: effectiveWindow.overtimeInfo.isDayOffOvertime,
            isInsideShiftHours: effectiveWindow.overtimeInfo.isInsideShiftHours,
            // Convert undefined to null for the reason field
            reason: effectiveWindow.overtimeInfo.reason || null,
          } as ApprovedOvertimeInfo)
        : null;

      const enhancedStatus = await enhancementService.enhanceAttendanceStatus(
        baseStatus?.latestAttendance
          ? AttendanceMappers.toAttendanceRecord(baseStatus.latestAttendance)
          : null,
        allPeriods[0],
        mappedOvertimeInfo,
      );

      const timeline = createTimelineEnhancement(
        allPeriods,
        records.filter((r): r is AttendanceRecord => r !== null),
        now,
      );

      const enhancedValidation = createEnhancedValidation(
        enhancedStatus,
        allPeriods,
        records.filter((r): r is AttendanceRecord => r !== null),
        now,
      );

      const response = mapEnhancedResponse(
        baseStatus,
        enhancedStatus,
        allPeriods,
        timeline,
        enhancedValidation,
        {
          records: records.filter((r): r is AttendanceRecord => r !== null),
          window: effectiveWindow,
          baseValidation,
          now,
        },
      );

      return res.status(200).json(response);
    } catch (error) {
      if (error instanceof AppError) {
        return res.status(400).json({
          error: error.code,
          message: error.message,
        });
      }
      throw error; // Re-throw unexpected errors
    }
  } catch (error) {
    console.error('Attendance status error:', {
      error,
      query: req.query,
      timestamp: getCurrentTime().toISOString(),
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Invalid request parameters',
      });
    }

    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  } finally {
    try {
      await prisma.$disconnect();
    } catch (err) {
      console.error('Error disconnecting from database:', err);
    }
  }
}

function createTimelineEnhancement(
  periods: Period[],
  records: AttendanceRecord[],
  now: Date,
): TimelineEnhancement {
  // Only create entry for current active period since second period hasn't started
  const currentRecord =
    records.find((r) => r.type === PeriodType.REGULAR && !r.CheckOutTime) ||
    null;

  const periodEntries = [
    {
      periodType: PeriodType.REGULAR,
      startTime: periods[0].startTime.toISOString(),
      endTime: periods[0].endTime.toISOString(),
      checkInTime: currentRecord?.CheckInTime?.toISOString(),
      checkOutTime: currentRecord?.CheckOutTime?.toISOString(),
      status: currentRecord?.CheckInTime
        ? PeriodStatus.ACTIVE
        : PeriodStatus.PENDING,
    },
  ];

  return {
    currentPeriodIndex: currentRecord ? 0 : -1, // 0 since regular period is active
    periodEntries,
  };
}

function createEnhancedValidation(
  enhanced: EnhancedAttendanceStatus,
  periods: Period[],
  records: AttendanceRecord[],
  now: Date,
): ValidationEnhancement {
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
      isWithinPeriod: enhanced.currentPeriod !== null,
      isEarlyForPeriod: checkIfEarlyForPeriod(enhanced.currentPeriod, now),
      isLateForPeriod: checkIfLateForPeriod(enhanced.currentPeriod, now),
      periodStart: enhanced.currentPeriod?.startTime ?? now,
      periodEnd: enhanced.currentPeriod?.endTime ?? now,
    },
  };
}

function getPeriodEntryStatus(
  period: Period,
  record: AttendanceRecord | null,
  now: Date,
): 'pending' | 'active' | 'completed' {
  // Handle overtime period specially
  if (period.type === PeriodType.OVERTIME) {
    const transitionStart = subMinutes(period.startTime, 30);

    // If in transition window
    if (
      isWithinInterval(now, { start: transitionStart, end: period.startTime })
    ) {
      return 'pending';
    }
  }

  if (isAfter(period.startTime, now)) return 'pending';
  if (record?.CheckOutTime) return 'completed';
  if (isWithinInterval(now, { start: period.startTime, end: period.endTime })) {
    return 'active';
  }
  return 'pending';
}

function checkIfEarlyForPeriod(period: Period | null, now: Date): boolean {
  if (!period) return false;
  const earlyWindow = subMinutes(
    period.startTime,
    ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
  );
  return isWithinInterval(now, { start: earlyWindow, end: period.startTime });
}

function checkIfLateForPeriod(period: Period | null, now: Date): boolean {
  if (!period) return false;
  const lateWindow = addMinutes(
    period.startTime,
    ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
  );
  return isAfter(now, lateWindow);
}

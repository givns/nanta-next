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
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { OvertimeState, PrismaClient } from '@prisma/client';
import {
  addMinutes,
  format,
  isAfter,
  isWithinInterval,
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

// Request validation schema
const CoordinatesSchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});

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

function deduplicatePeriods(periods: Period[]): Period[] {
  // Create a unique key for each period based on its critical attributes
  const uniquePeriodMap = new Map<string, Period>();

  periods.forEach((period) => {
    // Create a unique key that considers period type, start time, and end time
    const key = `${period.type}_${period.startTime.toISOString()}_${period.endTime.toISOString()}`;

    // Keep the first occurrence of a period with the same key
    if (!uniquePeriodMap.has(key)) {
      uniquePeriodMap.set(key, period);
    }
  });

  return Array.from(uniquePeriodMap.values());
}

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

  const uniquePeriods = deduplicatePeriods(allPeriods);

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
    period: Period,
    record: AttendanceRecord | null,
  ): OvertimePeriodInfo => {
    // Helper to convert string to OvertimeState enum
    const getOvertimeState = (
      state: string | null | undefined,
    ): OvertimeState => {
      switch (state) {
        case 'overtime-started':
          return OvertimeState.IN_PROGRESS;
        case 'overtime-ended':
          return OvertimeState.COMPLETED;
        default:
          return OvertimeState.NOT_STARTED;
      }
    };

    return {
      id: period.overtimeId!,
      startTime: format(period.startTime, 'HH:mm'),
      endTime: format(period.endTime, 'HH:mm'),
      status: getOvertimeState(record?.overtimeState),
    };
  };

  const mappedTransition: PeriodTransition = enhanced.pendingTransitions[0]
    ? {
        from: {
          periodIndex: allPeriods.findIndex(
            (p) => p.type === enhanced.pendingTransitions[0].from,
          ),
          type: enhanced.pendingTransitions[0].from,
        },
        to: {
          periodIndex: allPeriods.findIndex(
            (p) => p.type === enhanced.pendingTransitions[0].to,
          ),
          type: enhanced.pendingTransitions[0].to,
        },
        transitionTime:
          enhanced.pendingTransitions[0].transitionTime.toISOString(),
        isComplete: enhanced.pendingTransitions[0].isComplete,
      }
    : {
        from: { periodIndex: -1, type: PeriodType.REGULAR },
        to: { periodIndex: -1, type: PeriodType.REGULAR },
        transitionTime: context.now.toISOString(),
        isComplete: false,
      };

  // Check if we're in transition window
  const isInTransition =
    enhanced.pendingTransitions.length > 0 &&
    enhanced.pendingTransitions[0].from === PeriodType.REGULAR &&
    enhanced.pendingTransitions[0].to === PeriodType.OVERTIME;

  return {
    daily: {
      date: format(context.now, 'yyyy-MM-dd'),
      timeline,
      periods: uniquePeriods.map((period, index) => ({
        type: period.type,
        window: {
          start: period.startTime.toISOString(),
          end: period.endTime.toISOString(),
        },
        status: {
          isComplete: Boolean(nonNullRecords[index]?.CheckOutTime),
          isCurrent: isInTransition
            ? period.type === PeriodType.REGULAR // During transition, regular period is current
            : isWithinInterval(context.now, {
                start: period.startTime,
                end: period.endTime,
              }),
          requiresTransition: Boolean(period.isConnected),
        },
        attendance: nonNullRecords[index]
          ? mapToPeriodAttendance(nonNullRecords[index])
          : undefined,
        overtime:
          period.type === PeriodType.OVERTIME
            ? mapToOvertimePeriodInfo(period, nonNullRecords[index])
            : undefined,
      })),
      transitions: mappedTransition,
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
    window: isInTransition
      ? { ...context.window, type: PeriodType.REGULAR } // Keep as regular during transition
      : context.window,
    validation: {
      allowed: context.baseValidation.allowed,
      reason: isInTransition
        ? 'กรุณายืนยันการลงเวลาออกงานปกติและเข้าทำงานล่วงเวลา'
        : context.baseValidation.reason,
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
        isEarlyCheckIn: isInTransition
          ? false
          : enhancedValidation.periodValidation.isEarlyForPeriod,
        isAutoCheckOut: isInTransition,
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
        isAutoCheckIn: false,
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
          canCheckIn: isInTransition
            ? false
            : context.baseValidation.allowed && !nonNullRecords[0]?.CheckInTime,
          canCheckOut: isInTransition
            ? true
            : context.baseValidation.allowed &&
              !!nonNullRecords[0]?.CheckInTime,
          requiresTransition: isInTransition,
          message: isInTransition
            ? 'กรุณายืนยันการลงเวลาออกงานปกติและเข้าทำงานล่วงเวลา'
            : context.baseValidation.reason,
          enhancement: {
            isWithinPeriod: enhancedValidation.periodValidation.isWithinPeriod,
            isEarlyForPeriod: isInTransition
              ? false
              : enhancedValidation.periodValidation.isEarlyForPeriod,
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
  // Check for transition period
  const overtimePeriod = periods.find((p) => p.type === PeriodType.OVERTIME);
  const regularPeriod = periods.find((p) => p.type === PeriodType.REGULAR);

  const isInTransition =
    overtimePeriod &&
    regularPeriod &&
    isWithinInterval(now, {
      start: subMinutes(overtimePeriod.startTime, 30),
      end: overtimePeriod.startTime,
    });

  return {
    currentPeriodIndex: periods.findIndex((p) => {
      if (isInTransition && p.type === PeriodType.REGULAR) {
        return true; // During transition, regular period is current
      }
      return isWithinInterval(now, {
        start: p.startTime,
        end: p.endTime,
      });
    }),
    periodEntries: periods.map((period, index) => ({
      periodType: period.type,
      startTime: period.startTime.toISOString(),
      endTime: period.endTime.toISOString(),
      checkInTime: records[index]?.CheckInTime?.toISOString(),
      checkOutTime: records[index]?.CheckOutTime?.toISOString(),
      status:
        isInTransition && period.type === PeriodType.REGULAR
          ? 'active' // Keep regular period active during transition
          : getPeriodEntryStatus(period, records[index], now),
    })),
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

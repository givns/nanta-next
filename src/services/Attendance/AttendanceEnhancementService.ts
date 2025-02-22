// services/Attendance/AttendanceEnhancementService.ts
import {
  SerializedAttendanceRecord,
  ShiftWindowResponse,
  ValidationContext,
  UnifiedPeriodState,
  AttendanceRecord,
  PeriodTransition,
  StateValidation,
  PeriodStatusInfo,
  TransitionStatusInfo,
  AttendanceStatusResponse,
  TimeEntry,
  SerializedTimeEntry,
  SerializedOvertimeEntry,
  OvertimeEntry,
  OvertimeContext,
  ShiftData,
} from '@/types/attendance';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  parseISO,
  format,
  addMinutes,
  differenceInMinutes,
  addDays,
  startOfDay,
} from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';
import { TimeWindowManager } from '@/utils/timeWindow/TimeWindowManager';
import { PeriodStateResolver } from './PeriodStateResolver';

export class AttendanceEnhancementService {
  constructor(
    private readonly periodManager: PeriodManagementService,
    private readonly stateResolver: PeriodStateResolver,
    private readonly timeManager: TimeWindowManager,
  ) {}

  /**
   * Main entry point for enhancing attendance status
   */
  public async enhanceAttendanceStatus(
    serializedAttendance: SerializedAttendanceRecord | null,
    window: ShiftWindowResponse,
    context: ValidationContext,
  ): Promise<AttendanceStatusResponse> {
    const enhancementId = `enhance-${context.employeeId}-${Date.now()}`;
    const startTime = Date.now();

    // Performance tracking
    const tracker = {
      steps: [] as { name: string; duration: number; timestamp: string }[],
      lastStep: startTime,
      track: function (name: string, data?: any) {
        const now = Date.now();
        const duration = now - this.lastStep;
        this.lastStep = now;

        this.steps.push({
          name,
          duration,
          timestamp: new Date().toISOString(),
        });

        console.log(
          `[${enhancementId}] ENHANCE_STEP: ${name} (${duration}ms)`,
          data || '',
        );
        return this;
      },
    };

    console.log(`[${enhancementId}] ENHANCE: Starting attendance enhancement`, {
      employeeId: context.employeeId,
      timestamp: format(context.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      hasSerializedAttendance: !!serializedAttendance,
      windowType: window.type,
      hasOvertimeInfo: !!window.overtimeInfo,
      contextData: {
        isCheckIn: context.isCheckIn,
        periodType: context.periodType,
        isOvertime: context.isOvertime,
        hasShift: !!context.shift,
      },
    });

    tracker.track('init');

    try {
      // 1. Deserialize attendance record if exists
      const attendance = serializedAttendance
        ? this.deserializeAttendanceRecord(serializedAttendance)
        : null;

      tracker.track('deserialize_attendance', {
        success: !!attendance,
        attendanceType: attendance?.type,
        checkStatus: attendance?.checkStatus,
        state: attendance?.state,
      });

      // 2. Get period state using PeriodManagementService
      console.log(`[${enhancementId}] ENHANCE: Calling period manager`, {
        employeeId: context.employeeId,
        hasAttendance: !!attendance,
        recordsCount: attendance ? 1 : 0,
      });

      // 2. Get period state using PeriodManagementService
      const periodStatePromise = this.periodManager.getCurrentPeriodState(
        context.employeeId,
        attendance ? [attendance] : [],
        context.timestamp,
      );

      const periodState = await periodStatePromise;

      tracker.track('get_period_state', {
        periodType: periodState.current.type,
        hasOvertime: !!periodState.overtime,
        timeWindow: {
          start: periodState.current.timeWindow.start,
          end: periodState.current.timeWindow.end,
        },
      });

      // 3. Log state tracking information
      console.log(`[${enhancementId}] ENHANCE: Enhancement state tracking`, {
        currentTime: format(context.timestamp, 'yyyy-MM-dd HH:mm:ss'),
        hasAttendance: !!attendance,
        hasOvertimeInfo: !!periodState.overtime,
        overtimeDetails: periodState.overtime
          ? {
              id: periodState.overtime.id,
              startTime: periodState.overtime.startTime,
              endTime: periodState.overtime.endTime,
            }
          : null,
        isValidState: periodState.validation?.isValid,
      });

      // 4. Calculate status info
      const statusInfo = this.determinePeriodStatusInfo(
        attendance,
        periodState.current,
        window,
        context.timestamp,
      );

      // 5. Get transition information
      const transitionInfo = this.periodManager.determineTransitionStatusInfo(
        statusInfo,
        window.shift,
        periodState.transitions,
        context.timestamp,
      );

      // 6. Get state validation from resolver
      const stateValidation = this.stateResolver.createStateValidation(
        periodState.current,
        attendance,
        window.shift,
        context,
        statusInfo,
        transitionInfo,
      );

      // 7. Build the response
      return this.buildEnhancedResponse(
        attendance,
        periodState.current,
        window,
        periodState.transitions,
        stateValidation,
        statusInfo,
        transitionInfo,
        context.timestamp,
      );
    } catch (error) {
      console.error('Error enhancing attendance status:', error);
      throw error;
    }
  }

  /**
   * Builds the enhanced response with all context information
   */
  private buildEnhancedResponse(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    transitions: PeriodTransition[],
    stateValidation: StateValidation,
    statusInfo: PeriodStatusInfo,
    transitionInfo: TransitionStatusInfo,
    now: Date,
  ): AttendanceStatusResponse {
    // 1. Prepare daily status
    const today = startOfDay(now);
    const daily = {
      date: format(today, 'yyyy-MM-dd'),
      currentState: this.buildCurrentState(
        currentState,
        statusInfo,
        attendance,
      ),
      transitions: transitions,
    };

    // 2. Prepare base response
    const base = {
      state: attendance?.state || AttendanceState.ABSENT,
      checkStatus: attendance?.checkStatus || CheckStatus.PENDING,
      isCheckingIn:
        !attendance?.CheckInTime || Boolean(attendance?.CheckOutTime),
      latestAttendance: attendance
        ? this.serializeAttendanceRecord(attendance)
        : null,
      periodInfo: {
        type: currentState.type,
        isOvertime:
          currentState.type === PeriodType.OVERTIME ||
          statusInfo.isOvertimePeriod,
        overtimeState: attendance?.overtimeState,
      },
      validation: {
        canCheckIn: stateValidation.allowed && !statusInfo.isActiveAttendance,
        canCheckOut: stateValidation.allowed && statusInfo.isActiveAttendance,
        message: stateValidation.reason,
      },
      metadata: {
        lastUpdated: now.toISOString(),
        version: 1,
        source: attendance?.metadata?.source || 'system',
      },
    };

    // 3. Prepare context data
    const contextData = {
      shift: window.shift,
      schedule: {
        isHoliday: window.isHoliday,
        isDayOff: window.isDayOff,
        isAdjusted: window.isAdjusted,
        holidayInfo: window.holidayInfo,
      },
      nextPeriod: this.buildNextPeriod(window, transitionInfo),
      transition: transitionInfo.isInTransition
        ? {
            from: {
              type: currentState.type,
              end: format(transitionInfo.window.start, 'HH:mm'),
            },
            to: {
              type: transitionInfo.targetPeriod,
              start: window.nextPeriod?.startTime || null,
            },
            isInTransition: true,
          }
        : undefined,
    };

    // 4. Return complete response
    return {
      daily,
      base,
      context: contextData,
      validation: stateValidation,
    };
  }

  /**
   * Builds the current state representation
   */
  private buildCurrentState(
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
    attendance?: AttendanceRecord | null,
  ): UnifiedPeriodState {
    return {
      type: currentState.type,
      timeWindow: {
        start: currentState.timeWindow.start,
        end: currentState.timeWindow.end,
      },
      activity: {
        isActive: statusInfo.isActiveAttendance,
        checkIn:
          statusInfo.isActiveAttendance && attendance?.CheckInTime
            ? attendance.CheckInTime.toISOString()
            : currentState.activity.checkIn,
        checkOut:
          currentState.activity.checkOut ||
          attendance?.CheckOutTime?.toISOString() ||
          null,
        isOvertime: currentState.activity.isOvertime,
        isDayOffOvertime: currentState.activity.isDayOffOvertime,
        isInsideShiftHours: currentState.activity.isInsideShiftHours,
      },
      validation: {
        isWithinBounds: currentState.validation.isWithinBounds,
        isEarly: currentState.validation.isEarly,
        isLate: currentState.validation.isLate,
        isOvernight: currentState.validation.isOvernight,
        isConnected: currentState.validation.isConnected,
      },
    };
  }

  /**
   * Builds next period info with overtime awareness
   */
  private buildNextPeriod(
    window: ShiftWindowResponse,
    transitionInfo: TransitionStatusInfo,
  ): {
    type: PeriodType;
    startTime: string;
    overtimeInfo?: OvertimeContext;
  } | null {
    if (!transitionInfo.isInTransition) {
      return window.nextPeriod || null;
    }

    // Handle overtime info for next period
    const nextPeriodInfo = {
      type: transitionInfo.targetPeriod,
      startTime: format(transitionInfo.window.end, "yyyy-MM-dd'T'HH:mm:ss"),
      overtimeInfo:
        transitionInfo.targetPeriod === PeriodType.OVERTIME
          ? window.overtimeInfo
          : undefined,
    };

    return nextPeriodInfo;
  }

  /**
   * Determines period status information
   */
  private determinePeriodStatusInfo(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    periodState: ShiftWindowResponse,
    now: Date,
  ): PeriodStatusInfo {
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
    );
    const midShift = addMinutes(
      shiftStart,
      differenceInMinutes(shiftEnd, shiftStart) / 2,
    );

    const shiftTiming = {
      isMorningShift:
        parseInt(periodState.shift.startTime.split(':')[0], 10) < 12,
      isAfternoonShift:
        parseInt(periodState.shift.startTime.split(':')[0], 10) >= 12,
      isAfterMidshift: now >= midShift,
    };

    const isActive = Boolean(
      attendance?.CheckInTime && !attendance?.CheckOutTime,
    );

    const timingFlags = this.timeManager.calculateTimingFlags(
      attendance,
      currentState,
      now,
    );

    return {
      isActiveAttendance: isActive,
      isOvertimePeriod: currentState.type === PeriodType.OVERTIME,
      timingFlags,
      shiftTiming,
    };
  }

  /**
   * Check if is late check-out
   */
  private isLateCheckOut(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    // Delegate to TimeWindowManager
    return this.timeManager.isLateCheckOut(attendance, currentState, now);
  }

  /**
   * Check if is very late check-out
   */
  private isVeryLateCheckOut(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): boolean {
    // Delegate to TimeWindowManager
    return this.timeManager.isVeryLateCheckOut(attendance, currentState, now);
  }

  /**
   * Calculate minutes late for check-out
   */
  private calculateLateMinutes(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    now: Date,
  ): number {
    // Delegate to TimeWindowManager
    return this.timeManager.calculateLateMinutes(attendance, currentState, now);
  }

  /**
   * Check if after midshift
   */
  private isAfterMidshift(now: Date, shift: ShiftData): boolean {
    const today = format(now, 'yyyy-MM-dd');
    const shiftStart = parseISO(`${today}T${shift.startTime}`);
    const shiftEnd = parseISO(`${today}T${shift.endTime}`);

    // If overnight shift, handle differently
    let effectiveEnd = shiftEnd;
    if (shift.endTime < shift.startTime) {
      effectiveEnd = addDays(shiftEnd, 1);
    }

    // Calculate midshift point
    const midShift = addMinutes(
      shiftStart,
      differenceInMinutes(effectiveEnd, shiftStart) / 2,
    );

    return now >= midShift;
  }

  /**
   * Serialization Methods
   */

  /**
   * Deserializes an attendance record
   */
  private deserializeAttendanceRecord(
    serialized: SerializedAttendanceRecord,
  ): AttendanceRecord {
    return {
      ...serialized,
      date: new Date(serialized.date),
      CheckInTime: serialized.CheckInTime
        ? new Date(serialized.CheckInTime)
        : null,
      CheckOutTime: serialized.CheckOutTime
        ? new Date(serialized.CheckOutTime)
        : null,
      shiftStartTime: serialized.shiftStartTime
        ? new Date(serialized.shiftStartTime)
        : null,
      shiftEndTime: serialized.shiftEndTime
        ? new Date(serialized.shiftEndTime)
        : null,
      metadata: {
        ...serialized.metadata,
        createdAt: new Date(serialized.metadata.createdAt),
        updatedAt: new Date(serialized.metadata.updatedAt),
      },
      timeEntries: this.deserializeTimeEntries(serialized.timeEntries),
      overtimeEntries: this.deserializeOvertimeEntries(
        serialized.overtimeEntries,
      ),
    };
  }

  /**
   * Deserializes time entries
   */
  private deserializeTimeEntries(entries: SerializedTimeEntry[]): TimeEntry[] {
    return entries.map((entry) => ({
      ...entry,
      date: entry.startTime ? new Date(entry.startTime) : new Date(), // Add date field
      startTime: new Date(entry.startTime),
      endTime: entry.endTime ? new Date(entry.endTime) : null,
      metadata: {
        ...entry.metadata,
        createdAt: new Date(entry.metadata.createdAt),
        updatedAt: new Date(entry.metadata.updatedAt),
      },
    }));
  }

  /**
   * Deserializes overtime entries
   */
  private deserializeOvertimeEntries(
    entries: SerializedOvertimeEntry[],
  ): OvertimeEntry[] {
    return entries.map((entry) => ({
      ...entry,
      actualStartTime: entry.actualStartTime
        ? new Date(entry.actualStartTime)
        : null,
      actualEndTime: entry.actualEndTime ? new Date(entry.actualEndTime) : null,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    }));
  }

  /**
   * Serializes an attendance record
   */
  private serializeAttendanceRecord(
    record: AttendanceRecord,
  ): SerializedAttendanceRecord {
    return {
      ...record,
      date:
        typeof record.date === 'string'
          ? record.date
          : record.date.toISOString(),
      CheckInTime: record.CheckInTime?.toISOString() || null,
      CheckOutTime: record.CheckOutTime?.toISOString() || null,
      shiftStartTime: record.shiftStartTime?.toISOString() || null,
      shiftEndTime: record.shiftEndTime?.toISOString() || null,
      metadata: {
        ...record.metadata,
        createdAt:
          typeof record.metadata.createdAt === 'string'
            ? record.metadata.createdAt
            : record.metadata.createdAt.toISOString(),
        updatedAt:
          typeof record.metadata.updatedAt === 'string'
            ? record.metadata.updatedAt
            : record.metadata.updatedAt.toISOString(),
      },
      timeEntries: record.timeEntries.map((entry) =>
        this.serializeTimeEntry(entry),
      ),
      overtimeEntries: record.overtimeEntries.map((entry) =>
        this.serializeOvertimeEntry(entry),
      ),
    };
  }

  /**
   * Serializes a time entry
   */
  private serializeTimeEntry(entry: TimeEntry): SerializedTimeEntry {
    return {
      ...entry,
      startTime:
        typeof entry.startTime === 'string'
          ? entry.startTime
          : entry.startTime.toISOString(),
      endTime: entry.endTime
        ? typeof entry.endTime === 'string'
          ? entry.endTime
          : entry.endTime.toISOString()
        : null,
      metadata: {
        ...entry.metadata,
        createdAt:
          typeof entry.metadata.createdAt === 'string'
            ? entry.metadata.createdAt
            : entry.metadata.createdAt.toISOString(),
        updatedAt:
          typeof entry.metadata.updatedAt === 'string'
            ? entry.metadata.updatedAt
            : entry.metadata.updatedAt.toISOString(),
      },
    };
  }

  /**
   * Serializes an overtime entry
   */
  private serializeOvertimeEntry(
    entry: OvertimeEntry,
  ): SerializedOvertimeEntry {
    return {
      ...entry,
      actualStartTime: entry.actualStartTime
        ? typeof entry.actualStartTime === 'string'
          ? entry.actualStartTime
          : entry.actualStartTime.toISOString()
        : null,
      actualEndTime: entry.actualEndTime
        ? typeof entry.actualEndTime === 'string'
          ? entry.actualEndTime
          : entry.actualEndTime.toISOString()
        : null,
      createdAt:
        typeof entry.createdAt === 'string'
          ? entry.createdAt
          : entry.createdAt.toISOString(),
      updatedAt:
        typeof entry.updatedAt === 'string'
          ? entry.updatedAt
          : entry.updatedAt.toISOString(),
    };
  }
}

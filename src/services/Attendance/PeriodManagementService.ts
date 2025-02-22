// services/Attendance/PeriodManagementService.ts
//PeriodManagementService (Orchestrator)
//Primary responsibility: Manage period transitions and workflows
//Should own:
//Period transitions
//Period sequence management
//High-level period operations

import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
  PeriodDefinition,
  ValidationContext,
  OvertimeContext,
  VALIDATION_THRESHOLDS,
  ApprovedOvertimeInfo,
  ShiftData,
  TransitionInfo,
  PeriodState,
  PeriodStatusInfo,
  ATTENDANCE_CONSTANTS,
  AppError,
  ErrorCode,
  TimeWindow,
  TransitionStatusInfo,
} from '@/types/attendance';
import { PeriodType, AttendanceState } from '@prisma/client';
import {
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
  addMinutes,
  addDays,
  differenceInMinutes,
  startOfDay,
  subDays,
  isAfter,
} from 'date-fns';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { TimeWindowManager } from '@/utils/timeWindow/TimeWindowManager';
import { PeriodStateResolver } from './PeriodStateResolver';

interface PeriodValidation {
  canCheckIn: boolean;
  canCheckOut: boolean;
  isLateCheckIn: boolean;
  isLateCheckOut: boolean;
  isEarlyCheckOut: boolean;
  isWithinLateAllowance: boolean;
}

export class PeriodManagementService {
  constructor(
    private readonly shiftService: ShiftManagementService,
    private readonly timeManager: TimeWindowManager,
    private readonly stateResolver: PeriodStateResolver,
  ) {}
  /**
   * Main entry point for getting current period state
   */
  // ENHANCE: Make this the main entry point that calls StateResolver
  public async getCurrentPeriodState(
    employeeId: string,
    records: AttendanceRecord[] | null,
    now: Date,
  ): Promise<PeriodState> {
    const processId = `period-${employeeId}-${Date.now()}`;
    const startTime = Date.now();
    // Initialize tracker
    const tracker = {
      lastTimestamp: Date.now(),
      steps: [] as { name: string; duration: number }[],
      track: function (name: string, data?: any) {
        const current = Date.now();
        const duration = current - this.lastTimestamp;
        this.lastTimestamp = current;

        this.steps.push({ name, duration });
        console.log(
          `[${processId}] PERIOD_STEP: ${name} (${duration}ms)`,
          data || '',
        );
        return this;
      },
    };

    console.log(`[${processId}] PERIOD: Starting period state calculation`, {
      employeeId,
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
      recordsCount: records?.length || 0,
      hasActiveRecord:
        records?.some((r) => r.CheckInTime && !r.CheckOutTime) || false,
    });

    tracker.track('init');

    try {
      // Get shift data
      tracker.track('get_shift_start');
      const shiftData = await this.shiftService.getEffectiveShift(
        employeeId,
        now,
      );

      tracker.track('get_shift_complete', {
        hasShiftData: !!shiftData,
        shiftId: shiftData?.current?.id,
        workDays: shiftData?.current?.workDays?.length,
        timeRange: shiftData
          ? `${shiftData.current.startTime}-${shiftData.current.endTime}`
          : null,
      });

      if (!shiftData) {
        tracker.track('error_no_shift_data');
        throw new AppError({
          code: ErrorCode.SHIFT_DATA_ERROR,
          message: 'No shift configuration found',
        });
      }

      // Get active record
      tracker.track('find_active_record_start');
      const activeRecord = this.findActiveRecord(records || []);

      tracker.track('find_active_record_complete', {
        hasActiveRecord: !!activeRecord,
        activeRecordType: activeRecord?.type,
        activeRecordState: activeRecord?.state,
        hasCheckIn: !!activeRecord?.CheckInTime,
        hasCheckOut: !!activeRecord?.CheckOutTime,
      });

      // Create validation context
      const context: ValidationContext = {
        employeeId,
        timestamp: now,
        isCheckIn: !activeRecord,
        state: activeRecord?.state,
        checkStatus: activeRecord?.checkStatus,
        overtimeState: activeRecord?.overtimeState,
        attendance: activeRecord ?? undefined,
        shift: shiftData.current,
        periodType: activeRecord?.type || PeriodType.REGULAR,
        isOvertime: activeRecord?.type === PeriodType.OVERTIME,
        overtimeInfo: null, // Will be populated if exists
      };

      // Get overtime info if needed
      if (
        activeRecord?.type === PeriodType.OVERTIME ||
        (activeRecord?.type === PeriodType.REGULAR &&
          this.isNearShiftEnd(now, shiftData.current))
      ) {
        const overtimeInfo = await this.shiftService.getOvertimeInfo(
          employeeId,
          now,
        );
        if (overtimeInfo) {
          context.overtimeInfo = this.convertToApprovedOvertimeInfo(
            overtimeInfo,
            context,
            now,
          );
          context.isOvertime = true;
        }
      }

      // Get current state from resolver
      const currentState = await this.stateResolver.calculatePeriodState(
        employeeId,
        records,
        now,
        shiftData.current,
        context,
      );

      // Calculate status info
      const statusInfo = this.calculatePeriodStatusInfo(
        activeRecord,
        currentState,
        shiftData.current,
        now,
      );

      // Calculate transitions
      const transitions = this.calculatePeriodTransitions(
        currentState,
        {
          current: {
            start: currentState.timeWindow.start,
            end: currentState.timeWindow.end,
          },
          type: currentState.type,
          shift: shiftData.current,
          isHoliday: false,
          isDayOff: !shiftData.current.workDays.includes(now.getDay()),
          isAdjusted: shiftData.isAdjusted,
          overtimeInfo: context.overtimeInfo
            ? this.convertToOvertimeContext(context.overtimeInfo)
            : undefined,
        },
        activeRecord,
        now,
      );

      // Get transition info
      const transitionInfo = this.determineTransitionStatusInfo(
        statusInfo,
        shiftData.current,
        transitions,
        now,
      );

      // Get validation result
      const stateValidation = this.stateResolver.createStateValidation(
        currentState,
        activeRecord,
        shiftData.current,
        context,
        statusInfo,
        transitionInfo,
      );

      // Convert overtimeInfo to OvertimeContext
      const overtime = context.overtimeInfo
        ? this.convertToOvertimeContext(context.overtimeInfo)
        : undefined;

      return {
        current: currentState,
        transitions,
        overtime,
        validation: {
          isValid: stateValidation.allowed,
          state: activeRecord?.state || AttendanceState.ABSENT,
          errors: [],
          warnings: [],
          checkInAllowed:
            stateValidation.allowed && !statusInfo.isActiveAttendance,
          checkOutAllowed:
            stateValidation.allowed && statusInfo.isActiveAttendance,
          overtimeAllowed:
            statusInfo.isOvertimePeriod ||
            (currentState.validation.isConnected &&
              this.hasOvertimeFollowing(transitions)),
          metadata: {
            lastValidated: now,
            validatedBy: 'system',
            rules: ['TIME_WINDOW', 'ATTENDANCE_STATE', 'TRANSITION'],
          },
        },
      };
    } catch (error) {
      console.error('Error getting period state:', {
        employeeId,
        timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
        error,
      });
      throw error;
    }
  }

  // ENHANCE: Make this the central function for building period sequences
  public async buildPeriodSequence(
    overtimeInfo: OvertimeContext | undefined | null,
    shift: ShiftData,
    attendance: AttendanceRecord | null,
    now: Date,
  ): Promise<PeriodDefinition[]> {
    const periods: PeriodDefinition[] = [];

    console.log('Building Period Sequence Debug:', {
      overtimeInfo: overtimeInfo
        ? {
            startTime: overtimeInfo.startTime,
            endTime: overtimeInfo.endTime,
            isDayOffOvertime: overtimeInfo.isDayOffOvertime,
            id: 'id' in overtimeInfo ? overtimeInfo.id : 'NO_ID',
          }
        : 'UNDEFINED',
      attendanceDetails: attendance
        ? {
            type: attendance.type,
            checkIn: attendance.CheckInTime,
            checkOut: attendance.CheckOutTime,
          }
        : 'NO_ATTENDANCE',
    });

    // Handle active overnight overtime first
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime &&
      attendance.shiftStartTime &&
      attendance.shiftEndTime
    ) {
      const checkInTime = new Date(attendance.CheckInTime);
      const shiftEnd = new Date(attendance.shiftEndTime);

      // If active overnight period spans current time
      if (checkInTime <= now && now <= shiftEnd) {
        periods.push({
          type: PeriodType.OVERTIME,
          startTime: format(attendance.shiftStartTime, 'HH:mm'),
          endTime: format(attendance.shiftEndTime, 'HH:mm'),
          sequence: 1,
          isOvernight: true,
          isDayOff: overtimeInfo?.isDayOffOvertime || false,
        });

        // Return only this period
        return periods;
      }
    }

    // Always add overtime if it exists, regardless of timing
    if (overtimeInfo) {
      // Check if it's early morning overtime that occurs before regular shift
      const isEarlyMorningOT = this.isEarlyMorningOvertime(overtimeInfo, shift);

      // Determine sequence based on timing
      const sequence = isEarlyMorningOT ? 1 : periods.length + 1;

      periods.push({
        type: PeriodType.OVERTIME,
        startTime: overtimeInfo.startTime,
        endTime: overtimeInfo.endTime,
        sequence,
        isOvernight: this.isOvernightPeriod(
          overtimeInfo.startTime,
          overtimeInfo.endTime,
        ),
        isDayOff: overtimeInfo.isDayOffOvertime || false,
      });

      // For early morning overtime, we need to handle date context differently
      if (isEarlyMorningOT) {
        console.log('Detected early morning overtime before shift', {
          overtime: overtimeInfo.startTime + '-' + overtimeInfo.endTime,
          shift: shift.startTime + '-' + shift.endTime,
        });
      }
    }

    // Add regular shift
    periods.push({
      type: PeriodType.REGULAR,
      startTime: shift.startTime,
      endTime: shift.endTime,
      sequence: periods.length + 1,
      isOvernight: this.isOvernightPeriod(shift.startTime, shift.endTime),
    });

    const sortedPeriods = this.sortPeriodsByChronologicalOrder(periods, now);

    console.log('Built period sequence:', {
      periodsCount: sortedPeriods.length,
      periods: sortedPeriods.map((p) => ({
        type: p.type,
        start: p.startTime,
        end: p.endTime,
        isOvernight: p.isOvernight,
      })),
    });

    return sortedPeriods;
  }

  // NEW HELPER: Check if near shift end
  private isNearShiftEnd(now: Date, shift: ShiftData): boolean {
    const today = format(now, 'yyyy-MM-dd');
    const shiftEnd = parseISO(`${today}T${shift.endTime}`);

    // Consider within 30 minutes of shift end
    return isWithinInterval(now, {
      start: subMinutes(shiftEnd, 30),
      end: addMinutes(shiftEnd, 15),
    });
  }

  // NEW HELPER: Check if transitions include overtime
  private hasOvertimeFollowing(transitions: PeriodTransition[]): boolean {
    return transitions.some((t) => t.to.type === PeriodType.OVERTIME);
  }

  // Business logic methods

  private calculatePeriodStatusInfo(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    shiftData: ShiftData,
    now: Date,
  ): PeriodStatusInfo {
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${shiftData.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${shiftData.endTime}`,
    );
    const midShift = addMinutes(
      shiftStart,
      differenceInMinutes(shiftEnd, shiftStart) / 2,
    );

    const timingFlags = {
      isEarlyCheckIn: this.timeManager.isEarlyCheckIn(
        attendance,
        currentState,
        now,
      ),
      isLateCheckIn: this.timeManager.isLateCheckIn(
        attendance,
        currentState,
        now,
      ),
      isLateCheckOut: this.timeManager.isLateCheckOut(
        attendance,
        currentState,
        now,
      ),
      isEarlyCheckOut: this.timeManager.isEarlyCheckOut(
        attendance,
        currentState,
        now,
      ),
      isVeryLateCheckOut: this.timeManager.isVeryLateCheckOut(
        attendance,
        currentState,
        now,
      ),
      lateCheckOutMinutes: this.timeManager.calculateLateMinutes(
        attendance,
        currentState,
        now,
      ),
      requiresTransition: this.timeManager.requiresTransition(
        attendance,
        currentState,
        now,
      ),
      requiresAutoCompletion: this.timeManager.requiresAutoCompletion(
        attendance,
        currentState,
        now,
      ),
    };

    return {
      isActiveAttendance: Boolean(
        attendance?.CheckInTime && !attendance?.CheckOutTime,
      ),
      isOvertimePeriod: currentState.type === PeriodType.OVERTIME,
      timingFlags,
      shiftTiming: {
        isMorningShift: parseInt(shiftData.startTime.split(':')[0], 10) < 12,
        isAfternoonShift: parseInt(shiftData.startTime.split(':')[0], 10) >= 12,
        isAfterMidshift: now >= midShift,
      },
    };
  }

  /**
   * Calculates transitions between periods
   */
  public calculatePeriodTransitions(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    activeRecord: AttendanceRecord | null,
    now: Date,
  ): PeriodTransition[] {
    if (!window.overtimeInfo || !window.shift?.endTime || !window.shift?.id) {
      return [];
    }

    console.log('Calculating transitions:', {
      currentPeriod: currentState.type,
      hasActiveRecord: !!activeRecord,
      overtimeInfo: window.overtimeInfo,
    });

    // Transition from Overtime to Regular
    if (currentState.type === PeriodType.OVERTIME) {
      const regularShiftStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo?.endTime || '00:00'}`,
      );

      const transitionWindow = {
        start: overtimeEnd,
        end: addMinutes(regularShiftStart, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
      };

      const isInTransitionWindow = isWithinInterval(now, transitionWindow);

      if (isInTransitionWindow) {
        console.log('Detected Overtime to Regular Transition:', {
          overtimeEnd: format(overtimeEnd, 'HH:mm:ss'),
          regularShiftStart: format(regularShiftStart, 'HH:mm:ss'),
          currentTime: format(now, 'HH:mm:ss'),
        });

        return [
          {
            from: {
              periodIndex: 0,
              type: PeriodType.OVERTIME,
            },
            to: {
              periodIndex: 1,
              type: PeriodType.REGULAR,
            },
            transitionTime: window.shift.startTime,
            isComplete: false,
          },
        ];
      }
    }

    // Original Regular to Overtime transition logic
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const transitionWindow = {
      start: subMinutes(shiftEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
      end: addMinutes(shiftEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
    };

    const isInTransitionWindow = isWithinInterval(now, transitionWindow);
    const hasUpcomingOvertime =
      window.overtimeInfo?.startTime === window.shift.endTime;

    const isActiveRegularPeriod =
      activeRecord?.CheckInTime &&
      !activeRecord?.CheckOutTime &&
      currentState.type === PeriodType.REGULAR;

    if (isInTransitionWindow && hasUpcomingOvertime && isActiveRegularPeriod) {
      return [
        {
          from: {
            periodIndex: 0,
            type: PeriodType.REGULAR,
          },
          to: {
            periodIndex: 1,
            type: PeriodType.OVERTIME,
          },
          transitionTime: window.shift.endTime,
          isComplete: false,
        },
      ];
    }

    return [];
  }

  /**
   * Validates multiple transitions
   */
  public validateMultipleTransitions(
    transitions: PeriodTransition[],
    currentState: UnifiedPeriodState,
    now: Date,
  ): PeriodTransition[] {
    if (transitions.length <= 1) return transitions;

    // Sort transitions by time
    const sortedTransitions = [...transitions].sort((a, b) => {
      const timeA = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${a.transitionTime}`,
      );
      const timeB = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${b.transitionTime}`,
      );
      return timeA.getTime() - timeB.getTime();
    });

    // Filter out invalid transitions
    return sortedTransitions.filter((transition) => {
      const transitionTime = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${transition.transitionTime}`,
      );

      // Only keep transitions that are valid for current time
      return isWithinInterval(now, {
        start: subMinutes(
          transitionTime,
          VALIDATION_THRESHOLDS.TRANSITION_WINDOW,
        ),
        end: addMinutes(transitionTime, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
      });
    });
  }

  public determineTransitionStatusInfo(
    statusInfo: PeriodStatusInfo,
    shiftData: ShiftData,
    transitions: PeriodTransition[],
    now: Date,
  ): TransitionStatusInfo {
    // Early return if no transitions
    if (transitions.length === 0) {
      return {
        isInTransition: false,
        targetPeriod: PeriodType.REGULAR,
        window: {
          start: now,
          end: addMinutes(now, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
        },
      };
    }

    // Get the most immediate transition
    const nextTransition = transitions[0];
    const transitionTime = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${nextTransition.transitionTime}`,
    );

    // Calculate transition window
    const window = {
      start: subMinutes(
        transitionTime,
        VALIDATION_THRESHOLDS.TRANSITION_WINDOW,
      ),
      end: addMinutes(transitionTime, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
    };

    // Check if transition is valid
    const isInTransition = isWithinInterval(now, window);

    return {
      isInTransition,
      targetPeriod: nextTransition.to.type,
      window,
    };
  }

  /**
   * Checks if transition is required
   */
  public checkTransitionRequired(
    currentState: UnifiedPeriodState,
    activeRecord: AttendanceRecord | null,
    window: ShiftWindowResponse,
    now: Date,
  ): boolean {
    // No transition needed if no active record
    if (!activeRecord?.CheckInTime || activeRecord?.CheckOutTime) {
      return false;
    }

    // Use the validation.isConnected flag
    if (!currentState.validation.isConnected) {
      return false;
    }

    // Check for connecting period
    const currentEndTime = format(
      parseISO(currentState.timeWindow.end),
      'HH:mm',
    );
    const nextPeriodStartTime =
      window.overtimeInfo?.startTime || window.nextPeriod?.startTime;

    console.log('Transition check:', {
      currentEndTime,
      nextPeriodStartTime,
      hasConnection: currentEndTime === nextPeriodStartTime,
    });

    // Only require transition if periods are connected
    if (!nextPeriodStartTime || currentEndTime !== nextPeriodStartTime) {
      return false;
    }

    // Check if within transition window
    const periodEnd = parseISO(currentState.timeWindow.end);
    return isWithinInterval(now, {
      start: subMinutes(periodEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
      end: addMinutes(periodEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT), // Add grace period
    });
  }

  /**
   * Handles connected periods
   */
  public handleConnectedPeriods(
    currentState: UnifiedPeriodState,
    nextPeriod: UnifiedPeriodState | null,
    now: Date,
  ): boolean {
    if (!nextPeriod) return false;

    const currentEnd = parseISO(currentState.timeWindow.end);
    const nextStart = parseISO(nextPeriod.timeWindow.start);

    // Check if periods are connected
    if (format(currentEnd, 'HH:mm') === format(nextStart, 'HH:mm')) {
      // Check if we're in transition window
      return isWithinInterval(now, {
        start: subMinutes(currentEnd, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
        end: addMinutes(currentEnd, VALIDATION_THRESHOLDS.LATE_CHECKOUT),
      });
    }

    return false;
  }

  /**
   * Filters valid transitions
   */
  public filterValidTransitions(
    transitions: PeriodTransition[],
    transitionStatus: TransitionStatusInfo,
  ): PeriodTransition[] {
    return transitions.filter(
      (transition) =>
        transition.to.type === transitionStatus.targetPeriod &&
        transitionStatus.isInTransition,
    );
  }

  /**
   * Builds transition info
   */
  public buildTransitionInfo(
    transitionStatus: TransitionStatusInfo,
    periodState: ShiftWindowResponse,
  ): TransitionInfo | undefined {
    if (!transitionStatus.isInTransition || !periodState.overtimeInfo) {
      return undefined;
    }

    return {
      from: {
        type: PeriodType.REGULAR,
        end: format(transitionStatus.window.start, 'HH:mm'),
      },
      to: {
        type: PeriodType.OVERTIME,
        start: periodState.overtimeInfo.startTime,
      },
      isInTransition: true,
    };
  }

  /**
   * Validates period access
   */
  public validatePeriodAccess(
    currentState: UnifiedPeriodState,
    statusInfo: PeriodStatusInfo,
    now: Date,
  ): PeriodValidation {
    console.log('Validating period access:', {
      timeWindow: currentState.timeWindow,
      currentTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

    const today = startOfDay(now);

    const periodStart = parseISO(
      format(today, 'yyyy-MM-dd') +
        'T' +
        format(parseISO(currentState.timeWindow.start), 'HH:mm:ss'),
    );
    const periodEnd = parseISO(
      format(today, 'yyyy-MM-dd') +
        'T' +
        format(parseISO(currentState.timeWindow.end), 'HH:mm:ss'),
    );

    const checkInTime = currentState.activity.checkIn
      ? parseISO(currentState.activity.checkIn)
      : null;

    const isExistingAttendance = Boolean(checkInTime);

    const isInEarlyWindow = isWithinInterval(now, {
      start: subMinutes(periodStart, VALIDATION_THRESHOLDS.EARLY_CHECKIN),
      end: periodStart,
    });

    const isLateCheckIn =
      !isExistingAttendance &&
      differenceInMinutes(now, periodStart) >
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD;

    const shiftData: ShiftData = {
      startTime: format(parseISO(currentState.timeWindow.start), 'HH:mm'),
      endTime: format(parseISO(currentState.timeWindow.end), 'HH:mm'),
      id: 'current',
      name: 'Current Shift',
      shiftCode: 'CURRENT',
      workDays: [],
    };

    const isWithinLateAllowance = isWithinInterval(now, {
      start: periodStart,
      end: addMinutes(periodStart, VALIDATION_THRESHOLDS.LATE_CHECKIN),
    });

    const isWithinShift = this.timeManager.isWithinShiftWindow(now, shiftData, {
      includeLateWindow: true,
    });

    console.log('Period boundary check:', {
      todayDate: format(today, 'yyyy-MM-dd'),
      calculatedStart: format(periodStart, 'yyyy-MM-dd HH:mm:ss'),
      calculatedEnd: format(periodEnd, 'yyyy-MM-dd HH:mm:ss'),
      currentTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
      isLateCheckIn,
      isLateCheckOut: statusInfo.timingFlags.isLateCheckOut,
      isEarlyCheckOut: statusInfo.timingFlags.isEarlyCheckOut,
      isWithinShift,
    });

    return {
      canCheckIn:
        !statusInfo.isActiveAttendance && (isInEarlyWindow || isWithinShift),
      canCheckOut: this.stateResolver.canCheckOut(
        currentState,
        statusInfo,
        now,
      ),
      isLateCheckIn,
      isLateCheckOut: statusInfo.timingFlags.isLateCheckOut,
      isEarlyCheckOut: statusInfo.timingFlags.isEarlyCheckOut,
      isWithinLateAllowance,
    };
  }

  /**
   * Resolves current period
   */
  public async resolveCurrentPeriod(
    attendance: AttendanceRecord | null,
    windows: TimeWindow[],
    context: ValidationContext,
    originalShiftData: ShiftWindowResponse,
  ): Promise<UnifiedPeriodState> {
    // Make periodStateData mutable by using let
    let periodStateData: ShiftWindowResponse = {
      current: {
        start: format(windows[0].start, "yyyy-MM-dd'T'HH:mm:ss"),
        end: format(windows[0].end, "yyyy-MM-dd'T'HH:mm:ss"),
      },
      type: windows[0].type,
      shift: context.shift!,
      isHoliday: false,
      isDayOff: originalShiftData.isDayOff,
      isAdjusted: originalShiftData.isAdjusted,
      overtimeInfo: this.convertToOvertimeContext(context.overtimeInfo),
    };

    console.log('Resolution state tracking:', {
      hasAttendance: !!attendance,
      hasOriginalOvertimeInfo: !!originalShiftData?.overtimeInfo,
      hasCurrentOvertimeInfo: !!periodStateData.overtimeInfo,
      currentTime: format(context.timestamp, 'yyyy-MM-dd HH:mm:ss'),
    });

    const recentlyCompletedOvertime = this.findRecentlyCompletedOvertime(
      attendance,
      context.timestamp,
      30, // 30 minutes as recently completed threshold
    );

    if (recentlyCompletedOvertime) {
      return this.createPeriodStateFromCompletedOvertime(
        recentlyCompletedOvertime,
        context.timestamp,
        originalShiftData,
      );
    }

    // State preservation enhancement
    if (
      periodStateData.overtimeInfo === undefined &&
      originalShiftData?.overtimeInfo
    ) {
      console.log('Restoring lost overtimeInfo:', {
        restoredFrom: 'originalShiftData',
        info: {
          id: originalShiftData.overtimeInfo.id,
          startTime: originalShiftData.overtimeInfo.startTime,
          endTime: originalShiftData.overtimeInfo.endTime,
        },
      });

      // Create new object instead of modifying constant
      periodStateData = {
        ...periodStateData,
        overtimeInfo: originalShiftData.overtimeInfo,
      };
    }

    // Replace all periodState with periodStateData
    const periods = await this.buildPeriodSequence(
      periodStateData.overtimeInfo,
      periodStateData.shift,
      attendance,
      context.timestamp,
    );

    console.log('Period sequence with preserved state:', {
      periodsCount: periods.length,
      hasOvertimeInfo: !!periodStateData.overtimeInfo,
      periods: periods.map((p) => ({
        type: p.type,
        start: p.startTime,
        end: p.endTime,
      })),
    });

    const { currentPeriod, nextPeriod } = this.findRelevantPeriod(
      periods,
      context.timestamp,
      attendance,
      periodStateData, // Updated from periodState
    );

    if (!currentPeriod) {
      console.log(
        'No relevant period found, creating default with period state:',
        {
          shift: periodStateData.shift,
          currentTime: format(context.timestamp, 'HH:mm:ss'),
        },
      );

      // Call stateResolver's createDefaultState instead
      return this.stateResolver.createDefaultState(
        context.timestamp,
        periodStateData.shift,
        context,
      );
    }

    // Call stateResolver's createPeriodState instead
    return this.stateResolver.createPeriodState(
      [
        {
          start: parseISO(
            `${format(context.timestamp, 'yyyy-MM-dd')}T${currentPeriod.startTime}`,
          ),
          end: parseISO(
            `${format(context.timestamp, 'yyyy-MM-dd')}T${currentPeriod.endTime}`,
          ),
          type: currentPeriod.type,
        },
      ],
      attendance,
      context,
      periodStateData.shift,
    );
  }
  /**
   * Finds the most relevant period for the current time
   */
  public findRelevantPeriod(
    periods: PeriodDefinition[],
    now: Date,
    attendance?: AttendanceRecord | null,
    window?: ShiftWindowResponse,
  ): {
    currentPeriod: PeriodDefinition | null;
    nextPeriod: PeriodDefinition | null;
  } {
    console.log('Finding relevant period:', {
      currentTime: format(now, 'HH:mm:ss'),
      periods: periods.map((p) => ({
        type: p.type,
        start: p.startTime,
        end: p.endTime,
        isOvernight: p.isOvernight,
      })),
      isCheckIn: !attendance?.CheckInTime,
      attendance: attendance
        ? {
            type: attendance.type,
            checkIn: format(attendance.CheckInTime!, 'HH:mm:ss'),
            checkOut: attendance.CheckOutTime
              ? format(attendance.CheckOutTime, 'HH:mm:ss')
              : null,
          }
        : null,
    });

    let currentPeriod: PeriodDefinition | null = null;
    let nextPeriod: PeriodDefinition | null = null;

    const isCheckingIn = !attendance?.CheckInTime;
    const currentTimeStr = format(now, 'HH:mm');
    const referenceDate = startOfDay(now);

    // If checking in, specifically look for late check-in windows
    if (isCheckingIn) {
      // Find if there's a shift that just started
      const justStartedShift = periods.find(
        (p) =>
          p.type === PeriodType.REGULAR &&
          p.startTime <= currentTimeStr &&
          currentTimeStr <=
            addMinutes(
              parseISO(`${format(now, 'yyyy-MM-dd')}T${p.startTime}`),
              VALIDATION_THRESHOLDS.LATE_CHECKIN,
            )
              .toISOString()
              .slice(11, 16),
      );

      if (justStartedShift) {
        console.log('Found late check-in window for shift that just started:', {
          shiftStart: justStartedShift.startTime,
          currentTime: currentTimeStr,
          minutesLate: differenceInMinutes(
            now,
            parseISO(
              `${format(now, 'yyyy-MM-dd')}T${justStartedShift.startTime}`,
            ),
          ),
        });

        return {
          currentPeriod: justStartedShift,
          nextPeriod: null,
        };
      }
    }

    // First, check if regular period just completed and we're in overtime start window
    if (
      attendance?.type === PeriodType.REGULAR &&
      attendance.CheckOutTime &&
      window?.overtimeInfo
    ) {
      const overtimePeriod = periods.find(
        (p) => p.type === PeriodType.OVERTIME,
      );
      if (
        overtimePeriod &&
        currentTimeStr >= overtimePeriod.startTime &&
        currentTimeStr <= overtimePeriod.endTime
      ) {
        console.log('Found overtime period after regular completion:', {
          type: overtimePeriod.type,
          start: overtimePeriod.startTime,
          end: overtimePeriod.endTime,
        });
        return {
          currentPeriod: overtimePeriod,
          nextPeriod: null,
        };
      }
    }

    // Prioritize active overtime record
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime
    ) {
      const overtimePeriod = periods.find(
        (p) =>
          p.type === PeriodType.OVERTIME &&
          p.startTime === format(attendance.CheckInTime!, 'HH:mm'),
      );

      if (overtimePeriod) {
        return {
          currentPeriod: overtimePeriod,
          nextPeriod: null,
        };
      }
    }

    // Check all periods for the most relevant one
    for (const period of periods) {
      // Use isWithinOvernightPeriod for overnight periods
      if (period.isOvernight) {
        if (this.isWithinOvernightPeriod(now, referenceDate, period)) {
          currentPeriod = period;
          console.log('Found period using isWithinOvernightPeriod:', {
            type: period.type,
            start: period.startTime,
            end: period.endTime,
          });
          break;
        }
      } else {
        // For regular periods, use standard window check
        const currentPeriodStart = this.timeManager.parseTimeWithContext(
          period.startTime,
          now,
        );
        const currentPeriodEnd = this.timeManager.parseTimeWithContext(
          period.endTime,
          now,
        );

        // Include early and late windows
        const earlyWindow = subMinutes(
          currentPeriodStart,
          VALIDATION_THRESHOLDS.EARLY_CHECKIN,
        );

        const lateCheckInWindow = addMinutes(
          currentPeriodStart,
          VALIDATION_THRESHOLDS.LATE_CHECKIN,
        );

        const lateWindow = addMinutes(
          currentPeriodEnd,
          VALIDATION_THRESHOLDS.LATE_CHECKOUT,
        );

        if (
          // Regular period check
          isWithinInterval(now, { start: earlyWindow, end: lateWindow }) ||
          // Explicit late check-in window check
          (!attendance?.CheckInTime &&
            now > currentPeriodStart &&
            now <= lateCheckInWindow)
        ) {
          // For overtime periods, prioritize exact time match
          if (period.type === PeriodType.OVERTIME) {
            currentPeriod = period;
            break;
          } else if (!currentPeriod) {
            // Only set regular period if we haven't found an overtime period
            currentPeriod = period;
          }
        }
      }
    }

    // Find next upcoming period
    nextPeriod =
      periods.find((period) => {
        const start = this.timeManager.parseTimeWithContext(
          period.startTime,
          now,
        );
        return now < start;
      }) || null;

    console.log('Period Resolution:', {
      currentPeriod: currentPeriod
        ? {
            type: currentPeriod.type,
            start: currentPeriod.startTime,
            end: currentPeriod.endTime,
          }
        : null,
      nextPeriod: nextPeriod
        ? {
            type: nextPeriod.type,
            start: nextPeriod.startTime,
            end: nextPeriod.endTime,
          }
        : null,
    });

    return {
      currentPeriod,
      nextPeriod,
    };
  }

  /**
   * Creates period state from completed overtime
   */
  public createPeriodStateFromCompletedOvertime(
    completedOvertime: AttendanceRecord,
    now: Date,
    window: ShiftWindowResponse,
  ): UnifiedPeriodState {
    if (!completedOvertime.shiftStartTime || !completedOvertime.shiftEndTime) {
      console.warn(
        'Missing shift times for completed overtime',
        completedOvertime,
      );
      return this.stateResolver.createDefaultState(now, window.shift, {
        employeeId: completedOvertime.employeeId,
        timestamp: now,
        isCheckIn: true,
      });
    }

    return {
      type: PeriodType.OVERTIME,
      timeWindow: {
        start: format(
          completedOvertime.shiftStartTime,
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
        end: format(
          completedOvertime.shiftEndTime,
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
      },
      activity: {
        isActive: false,
        checkIn: completedOvertime.CheckInTime
          ? format(completedOvertime.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS")
          : null,
        checkOut: completedOvertime.CheckOutTime
          ? format(completedOvertime.CheckOutTime, "yyyy-MM-dd'T'HH:mm:ss.SSS")
          : null,
        isOvertime: true,
        isDayOffOvertime: false,
        isInsideShiftHours: false,
      },
      validation: {
        isWithinBounds: isWithinInterval(now, {
          start: completedOvertime.shiftStartTime,
          end: completedOvertime.shiftEndTime,
        }),
        isEarly: false,
        isLate: false,
        isOvernight: isAfter(
          completedOvertime.shiftEndTime,
          addDays(completedOvertime.shiftStartTime, 1),
        ),
        isConnected: true,
      },
    };
  }

  private findRecentlyCompletedOvertime(
    attendance: AttendanceRecord | null,
    now: Date,
    thresholdMinutes: number,
  ): AttendanceRecord | null {
    if (!attendance || !attendance.CheckOutTime) return null;

    const checkoutTime = new Date(attendance.CheckOutTime);
    const minutesSinceCheckout = differenceInMinutes(now, checkoutTime);

    if (
      attendance.type === PeriodType.OVERTIME &&
      minutesSinceCheckout <= thresholdMinutes
    ) {
      return attendance;
    }
    return null;
  }

  private findActiveRecord(
    records: AttendanceRecord[],
  ): AttendanceRecord | null {
    return (
      records.find((record) => record.CheckInTime && !record.CheckOutTime) ||
      null
    );
  }

  private isBeforeShift(time1: string, time2: string): boolean {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    return hours1 * 60 + minutes1 < hours2 * 60 + minutes2;
  }

  private isOvernightPeriod(start: string, end: string): boolean {
    const [startHours, startMinutes] = start.split(':').map(Number);
    const [endHours, endMinutes] = end.split(':').map(Number);

    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;

    return endTotalMinutes < startTotalMinutes;
  }

  private sortPeriodsByChronologicalOrder(
    periods: PeriodDefinition[],
    now: Date,
  ): PeriodDefinition[] {
    return periods.sort((a, b) => {
      const aTime = this.timeManager.parseTimeWithContext(a.startTime, now);
      const bTime = this.timeManager.parseTimeWithContext(b.startTime, now);
      return aTime.getTime() - bTime.getTime();
    });
  }

  private isEarlyMorningOvertime(
    overtime: OvertimeContext,
    shift: ShiftData,
  ): boolean {
    const otStart = this.parseTimeToMinutes(overtime.startTime);
    const shiftStart = this.parseTimeToMinutes(shift.startTime);
    return otStart < shiftStart;
  }

  private parseTimeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private isWithinOvernightPeriod(
    now: Date,
    reference: Date,
    period: PeriodDefinition,
  ): boolean {
    let periodStart = this.timeManager.parseTimeWithContext(
      period.startTime,
      reference,
    );
    let periodEnd = this.timeManager.parseTimeWithContext(
      period.endTime,
      reference,
    );

    // If it's an overnight period and end time is before start time
    if (period.isOvernight && period.endTime < period.startTime) {
      periodEnd = addDays(periodEnd, 1);
    }

    // If we're after midnight but before period end
    if (now < periodStart && period.isOvernight) {
      periodStart = subDays(periodStart, 1);
      periodEnd = subDays(periodEnd, 1);
    }

    return isWithinInterval(now, { start: periodStart, end: periodEnd });
  }

  /**
   * New methods taking over from ShiftManagementService
   */
  async getNextDayPeriodState(
    employeeId: string,
    date: Date,
  ): Promise<ShiftWindowResponse> {
    const nextDay = addDays(date, 1);
    const [shiftData, overtimeInfo] = await Promise.all([
      this.shiftService.getEffectiveShift(employeeId, nextDay),
      this.shiftService.getOvertimeInfo(employeeId, nextDay),
    ]);

    if (!shiftData) {
      throw new Error('No shift configuration found for next day');
    }

    return {
      current: {
        start: `${format(nextDay, 'yyyy-MM-dd')}T${shiftData.current.startTime}`,
        end: `${format(nextDay, 'yyyy-MM-dd')}T${shiftData.current.endTime}`,
      },
      type: overtimeInfo ? PeriodType.OVERTIME : PeriodType.REGULAR,
      shift: shiftData.current,
      isHoliday: false,
      isDayOff: !shiftData.current.workDays.includes(nextDay.getDay()),
      isAdjusted: shiftData.isAdjusted,
      overtimeInfo,
    };
  }

  private convertToOvertimeContext(
    info: ApprovedOvertimeInfo | null | undefined,
  ): OvertimeContext | undefined {
    if (!info) return undefined;

    return {
      id: info.id,
      startTime: info.startTime,
      endTime: info.endTime,
      durationMinutes: info.durationMinutes,
      reason: info.reason || undefined, // Convert null to undefined
      isInsideShiftHours: info.isInsideShiftHours,
      isDayOffOvertime: info.isDayOffOvertime,
    };
  }
  private convertToApprovedOvertimeInfo(
    overtimeContext: OvertimeContext,
    context: ValidationContext,
    now: Date,
  ): ApprovedOvertimeInfo {
    return {
      id: overtimeContext.id,
      employeeId: context.employeeId, // From the context
      date: now, // Current date
      startTime: overtimeContext.startTime,
      endTime: overtimeContext.endTime,
      durationMinutes: overtimeContext.durationMinutes,
      status: 'approved' as any, // Assuming this is an approved overtime
      employeeResponse: null,
      reason: overtimeContext.reason || null,
      approverId: null,
      isDayOffOvertime: overtimeContext.isDayOffOvertime,
      isInsideShiftHours: overtimeContext.isInsideShiftHours,
    };
  }
}

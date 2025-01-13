import {
  AttendanceRecord,
  ShiftWindowResponse,
  AttendanceStateResponse,
  UnifiedPeriodState,
  StateValidation,
  ShiftContext,
  TransitionContext,
  ATTENDANCE_CONSTANTS,
  OvertimeContext,
  TransitionInfo,
  PeriodStatus,
  PeriodStatusInfo,
  TransitionStatusInfo,
  ValidationFlags,
  SerializedAttendanceRecord,
  SerializedTimeEntry,
  TimeEntry,
  SerializedOvertimeEntry,
  OvertimeEntry,
  VALIDATION_ACTIONS,
  VALIDATION_THRESHOLDS,
} from '@/types/attendance';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  addMinutes,
  differenceInMinutes,
  format,
  isBefore,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';
import { getCurrentTime } from '@/utils/dateUtils';

interface OvertimeCheckoutStatus {
  shouldAutoComplete: boolean;
  allowManualCheckout: boolean;
  checkoutTime: Date | null;
  reason: string;
}

const TRANSITION_CONFIG = {
  EARLY_BUFFER: 15, // 15 minutes before period
  LATE_BUFFER: 15, // 15 minutes after period
} as const;

export class AttendanceEnhancementService {
  constructor(private readonly periodManager: PeriodManagementService) {}

  private determineCurrentPeriod(
    attendance: AttendanceRecord | null,
    window: ShiftWindowResponse,
    now: Date,
  ): { type: PeriodType; isActive: boolean } {
    // If attendance record exists and is not checked out
    if (attendance && !attendance.CheckOutTime) {
      return {
        type: attendance.type,
        isActive: true,
      };
    }

    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );

    // Check for overtime period (both current and upcoming)
    if (window.overtimeInfo) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.endTime}`,
      );

      // If overtime is before regular shift (early morning overtime)
      if (overtimeStart < shiftStart) {
        // Check if we're approaching overtime period (within early check-in window)
        const overtimeEarlyThreshold = subMinutes(
          overtimeStart,
          VALIDATION_THRESHOLDS.EARLY_CHECKIN,
        );

        if (now >= overtimeEarlyThreshold) {
          return {
            type: PeriodType.OVERTIME,
            isActive: false,
          };
        }
      }

      // Check if currently in overtime period
      if (isWithinInterval(now, { start: overtimeStart, end: overtimeEnd })) {
        return {
          type: PeriodType.OVERTIME,
          isActive: false,
        };
      }
    }

    // Default to regular period
    return {
      type: PeriodType.REGULAR,
      isActive: false,
    };
  }

  private determineTransitionContext(
    now: Date,
    periodState: ShiftWindowResponse,
    overtimeInfo?: OvertimeContext | null,
  ): TransitionInfo | undefined {
    if (!overtimeInfo) return undefined;

    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${periodState.shift.endTime}`,
    );
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
    );

    console.log('Determining transition:', {
      currentTime: format(now, 'HH:mm'),
      shift: {
        start: format(shiftStart, 'HH:mm'),
        end: format(shiftEnd, 'HH:mm'),
      },
      overtime: {
        start: format(overtimeStart, 'HH:mm'),
        startTime: overtimeInfo.startTime,
      },
    });

    // Pre-shift overtime (early morning)
    if (overtimeStart < shiftStart) {
      const preShiftTransitionWindow = {
        start: subMinutes(overtimeStart, TRANSITION_CONFIG.EARLY_BUFFER),
        end: overtimeStart,
      };

      const isInPreShiftWindow = isWithinInterval(
        now,
        preShiftTransitionWindow,
      );

      if (isInPreShiftWindow) {
        return {
          from: {
            type: PeriodType.REGULAR,
            end: format(overtimeStart, 'HH:mm'),
          },
          to: {
            type: PeriodType.OVERTIME,
            start: overtimeInfo.startTime,
          },
          isInTransition: true,
        };
      }
    }

    // Post-shift overtime
    if (overtimeStart >= shiftEnd) {
      const postShiftTransitionWindow = {
        start: subMinutes(shiftEnd, TRANSITION_CONFIG.EARLY_BUFFER),
        end: addMinutes(shiftEnd, TRANSITION_CONFIG.LATE_BUFFER),
      };

      const isInPostShiftWindow = isWithinInterval(
        now,
        postShiftTransitionWindow,
      );

      if (isInPostShiftWindow) {
        return {
          from: {
            type: PeriodType.REGULAR,
            end: periodState.shift.endTime,
          },
          to: {
            type: PeriodType.OVERTIME,
            start: overtimeInfo.startTime,
          },
          isInTransition: true,
        };
      }
    }

    return undefined;
  }

  private deserializeTimeEntry(entry: SerializedTimeEntry): TimeEntry {
    return {
      id: entry.id,
      employeeId: entry.employeeId,
      date: new Date(), // Since not in serialized form, use attendance date
      startTime: new Date(entry.startTime),
      endTime: entry.endTime ? new Date(entry.endTime) : null,
      status: entry.status,
      entryType: entry.entryType,
      hours: entry.hours,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      timing: entry.timing,
      metadata: {
        createdAt: new Date(entry.metadata.createdAt),
        updatedAt: new Date(entry.metadata.updatedAt),
        source: entry.metadata.source,
        version: entry.metadata.version,
      },
    };
  }

  private deserializeOvertimeEntry(
    entry: SerializedOvertimeEntry,
  ): OvertimeEntry {
    return {
      id: entry.id,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      actualStartTime: entry.actualStartTime
        ? new Date(entry.actualStartTime)
        : null,
      actualEndTime: entry.actualEndTime ? new Date(entry.actualEndTime) : null,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    };
  }

  private deserializeAttendanceRecord(
    record: SerializedAttendanceRecord | null,
  ): AttendanceRecord | null {
    if (!record) return null;

    return {
      ...record,
      date: new Date(record.date),
      CheckInTime: record.CheckInTime ? new Date(record.CheckInTime) : null,
      CheckOutTime: record.CheckOutTime ? new Date(record.CheckOutTime) : null,
      shiftStartTime: record.shiftStartTime
        ? new Date(record.shiftStartTime)
        : null,
      shiftEndTime: record.shiftEndTime ? new Date(record.shiftEndTime) : null,
      metadata: {
        isManualEntry: record.metadata.isManualEntry,
        isDayOff: record.metadata.isDayOff,
        createdAt: new Date(record.metadata.createdAt),
        updatedAt: new Date(record.metadata.updatedAt),
        source: record.metadata.source,
      },
      timeEntries: record.timeEntries.map((entry) =>
        this.deserializeTimeEntry(entry),
      ),
      overtimeEntries: record.overtimeEntries.map((entry) =>
        this.deserializeOvertimeEntry(entry),
      ),
    };
  }

  async enhanceAttendanceStatus(
    serializedAttendance: SerializedAttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): Promise<AttendanceStateResponse> {
    // Deserialize for internal processing
    const attendance = this.deserializeAttendanceRecord(serializedAttendance);

    const currentPeriod = this.determineCurrentPeriod(
      attendance,
      periodState,
      now,
    );

    const currentState = this.periodManager.resolveCurrentPeriod(
      attendance,
      periodState,
      now,
    );

    const transitions = this.periodManager.calculatePeriodTransitions(
      currentState,
      periodState,
      now,
    );

    const isOvertimeActive = Boolean(
      attendance?.isOvertime || attendance?.type === PeriodType.OVERTIME,
    );

    console.log('Building context:', {
      currentTime: format(now, 'HH:mm'),
      isOvertimeActive,
      currentType: attendance?.type,
      transitions: transitions.length,
    });

    const context: ShiftContext & TransitionContext = {
      shift: periodState.shift,
      schedule: {
        isHoliday: periodState.isHoliday,
        isDayOff: periodState.isDayOff,
        isAdjusted: periodState.isAdjusted,
        holidayInfo: periodState.holidayInfo,
      },
      nextPeriod:
        !currentPeriod.isActive && transitions.length > 0
          ? {
              type: transitions[0].to.type,
              startTime: transitions[0].transitionTime,
              overtimeInfo: periodState.overtimeInfo,
            }
          : null,
      transition: !currentPeriod.isActive
        ? this.determineTransitionContext(
            now,
            periodState,
            periodState.overtimeInfo,
          )
        : undefined,
    };

    const stateValidation = this.createStateValidation(
      attendance,
      currentState,
      periodState,
      now,
    );

    // Keep serialized format in response
    return {
      daily: {
        date: format(now, 'yyyy-MM-dd'),
        currentState,
        transitions: isOvertimeActive ? [] : transitions,
      },
      base: {
        state: attendance?.state || AttendanceState.ABSENT,
        checkStatus: attendance?.checkStatus || CheckStatus.PENDING,
        isCheckingIn:
          !attendance?.CheckInTime || Boolean(attendance?.CheckOutTime),
        latestAttendance: serializedAttendance, // Keep original serialized version
        periodInfo: {
          type: currentState.type,
          isOvertime: currentState.activity.isOvertime,
          overtimeState: attendance?.overtimeState,
        },
        validation: {
          canCheckIn:
            !currentState.activity.isActive && stateValidation.allowed,
          canCheckOut:
            currentState.activity.isActive && stateValidation.allowed,
          message: stateValidation.reason,
        },
        metadata: {
          lastUpdated: now.toISOString(),
          version: 1,
          source: attendance?.metadata?.source || 'system',
        },
      },
      context,
      validation: stateValidation,
    };
  }

  public createStateValidation(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): StateValidation {
    console.log('Creating state validation:', {
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
      currentState: {
        type: currentState.type,
        isActive: currentState.activity.isActive,
        isOvertime: currentState.activity.isOvertime,
      },
      window: {
        shift: {
          start: window.shift.startTime,
          end: window.shift.endTime,
        },
        overtime: window.overtimeInfo
          ? {
              start: window.overtimeInfo.startTime,
              end: window.overtimeInfo.endTime,
              isBeforeShift:
                window.overtimeInfo.startTime < window.shift.startTime,
            }
          : null,
      },
    });

    const periodStatusInfo = this.determinePeriodStatusInfo(
      attendance,
      currentState,
      window,
      now,
    );

    // First check: Active session
    if (periodStatusInfo.isActiveAttendance) {
      const isOvertimeSession = attendance!.type === PeriodType.OVERTIME;
      const overtimeStatus =
        isOvertimeSession && window.overtimeInfo
          ? this.determineOvertimeCheckoutStatus(
              now,
              window.overtimeInfo.endTime,
              true,
            )
          : null;

      return {
        allowed: isOvertimeSession
          ? (overtimeStatus?.allowManualCheckout ?? true)
          : true,
        reason: overtimeStatus?.reason || '',
        flags: this.getValidationFlags({
          hasActivePeriod: true,
          isCheckingIn: false,
          isOvertime: isOvertimeSession,
          isDayOffOvertime: Boolean(
            isOvertimeSession && window.overtimeInfo?.isDayOffOvertime,
          ),
          isInsideShift: !isOvertimeSession,
          isOutsideShift: isOvertimeSession,
          isAutoCheckOut: Boolean(overtimeStatus?.shouldAutoComplete),
          requiresAutoCompletion: Boolean(overtimeStatus?.shouldAutoComplete),
        }),
        metadata: overtimeStatus?.shouldAutoComplete
          ? {
              requiredAction: VALIDATION_ACTIONS.AUTO_COMPLETE_OVERTIME,
              nextTransitionTime: overtimeStatus.checkoutTime?.toISOString(),
              additionalInfo: {
                autoCompleteTime: overtimeStatus.checkoutTime
                  ? format(overtimeStatus.checkoutTime, 'HH:mm:ss')
                  : undefined,
              },
            }
          : {
              requiredAction: VALIDATION_ACTIONS.ACTIVE_SESSION,
              additionalInfo: {
                periodType: attendance!.type,
              },
            },
      };
    }

    // Second check: Early morning overtime
    if (window.overtimeInfo && !periodStatusInfo.isActiveAttendance) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
      );
      const shiftStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`,
      );
      const isEarlyOvertime = overtimeStart < shiftStart;

      if (isEarlyOvertime) {
        const earlyWindow = subMinutes(
          overtimeStart,
          VALIDATION_THRESHOLDS.EARLY_CHECKIN,
        );
        const isApproachingOvertime = now >= earlyWindow;

        console.log('Early overtime validation:', {
          currentTime: format(now, 'HH:mm:ss'),
          overtimeStart: format(overtimeStart, 'HH:mm:ss'),
          earlyWindow: format(earlyWindow, 'HH:mm:ss'),
          isApproachingOvertime,
        });

        return {
          allowed: isApproachingOvertime,
          reason: isApproachingOvertime
            ? ''
            : `รอเริ่มเวลาทำงานล่วงเวลาในเวลา ${format(overtimeStart, 'HH:mm')} น.`,
          flags: this.getValidationFlags({
            hasActivePeriod: false,
            isCheckingIn: true,
            isOvertime: true,
            isPendingOvertime: true,
            isInsideShift: false,
            isOutsideShift: true,
            isDayOffOvertime: Boolean(window.overtimeInfo.isDayOffOvertime),
          }),
          metadata: {
            nextTransitionTime: format(
              overtimeStart,
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            requiredAction: VALIDATION_ACTIONS.WAIT_FOR_OVERTIME,
            additionalInfo: {
              overtimeStart: format(overtimeStart, 'HH:mm'),
              earlyWindow: format(earlyWindow, 'HH:mm'),
              type: 'EARLY_OVERTIME',
            },
          },
        };
      }
    }

    // Third check: Period transitions
    const transitionStatus = this.determineTransitionStatusInfo(
      periodStatusInfo,
      window,
      now,
    );

    if (transitionStatus.isInTransition) {
      return {
        allowed: true,
        reason: 'กำลังเข้าสู่ช่วงเวลาทำงานล่วงเวลา',
        flags: this.getValidationFlags({
          hasActivePeriod: false,
          isCheckingIn: true,
          isPendingOvertime: true,
          hasPendingTransition: true,
          requiresTransition: true,
          isInsideShift: false,
          isOutsideShift: true,
        }),
        metadata: {
          nextTransitionTime: format(
            transitionStatus.window.end,
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
          ),
          requiredAction: VALIDATION_ACTIONS.TRANSITION_REQUIRED,
          transitionWindow: {
            start: format(
              transitionStatus.window.start,
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            end: format(
              transitionStatus.window.end,
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            targetPeriod: transitionStatus.targetPeriod,
          },
        },
      };
    }

    // Default: Regular validation
    const isWithinRegularPeriod = isWithinInterval(now, {
      start: parseISO(window.current.start),
      end: parseISO(window.current.end),
    });

    return {
      allowed: isWithinRegularPeriod,
      reason: isWithinRegularPeriod ? '' : 'ไม่อยู่ในช่วงเวลาทำงาน',
      flags: this.getValidationFlags({
        hasActivePeriod: false,
        isCheckingIn: true,
        isInsideShift: isWithinRegularPeriod,
        isOutsideShift: !isWithinRegularPeriod,
      }),
      metadata: {
        requiredAction: VALIDATION_ACTIONS.REGULAR_CHECKIN,
        additionalInfo: {
          type: 'REGULAR_PERIOD',
          periodWindow: {
            start: format(parseISO(window.current.start), 'HH:mm'),
            end: format(parseISO(window.current.end), 'HH:mm'),
          },
        },
      },
    };
  }

  private determinePeriodStatusInfo(
    attendance: AttendanceRecord | null,
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): PeriodStatusInfo {
    const shiftStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.startTime}`,
    );
    const shiftEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const midShift = addMinutes(
      shiftStart,
      differenceInMinutes(shiftEnd, shiftStart) / 2,
    );

    return {
      isActiveAttendance: Boolean(
        attendance?.CheckInTime && !attendance?.CheckOutTime,
      ),
      isOvertimePeriod: Boolean(
        attendance?.isOvertime || currentState.type === PeriodType.OVERTIME,
      ),
      timingFlags: {
        isEarlyCheckIn: currentState.validation.isEarly,
        isLateCheckIn: currentState.validation.isLate,
        isLateCheckOut: false,
        isVeryLateCheckOut: false,
        lateCheckOutMinutes: 0,
      },
      shiftTiming: {
        isMorningShift: parseInt(window.shift.startTime.split(':')[0], 10) < 12,
        isAfternoonShift:
          parseInt(window.shift.startTime.split(':')[0], 10) >= 12,
        isAfterMidshift: now >= midShift,
      },
    };
  }

  private determineTransitionStatusInfo(
    periodStatusInfo: PeriodStatusInfo,
    window: ShiftWindowResponse,
    now: Date,
  ): TransitionStatusInfo {
    // Handle transitions to overtime
    if (window.overtimeInfo && !periodStatusInfo.isActiveAttendance) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
      );
      const transitionStart = subMinutes(
        overtimeStart,
        VALIDATION_THRESHOLDS.TRANSITION_WINDOW,
      );

      if (now >= transitionStart && now < overtimeStart) {
        return {
          isInTransition: true,
          targetPeriod: PeriodType.OVERTIME,
          window: {
            start: transitionStart,
            end: overtimeStart,
          },
        };
      }
    }

    // Default case - no transition
    const defaultWindow = {
      start: now,
      end: addMinutes(now, VALIDATION_THRESHOLDS.TRANSITION_WINDOW),
    };

    return {
      isInTransition: false,
      targetPeriod: PeriodType.REGULAR,
      window: defaultWindow,
    };
  }

  private getRegularValidation(
    periodStatusInfo: PeriodStatusInfo,
    window: ShiftWindowResponse,
    attendance: AttendanceRecord | null,
  ): StateValidation {
    const shiftEnd = parseISO(
      `${format(getCurrentTime(), 'yyyy-MM-dd')}T${window.shift.endTime}`,
    );
    const midShiftTime = this.calculateMidShift(
      parseISO(
        `${format(getCurrentTime(), 'yyyy-MM-dd')}T${window.shift.startTime}`,
      ),
      shiftEnd,
    );

    const isVeryEarlyCheckout =
      periodStatusInfo.isActiveAttendance &&
      !periodStatusInfo.shiftTiming.isAfterMidshift;

    // Handle emergency leave case
    if (isVeryEarlyCheckout) {
      return {
        allowed: true,
        reason: 'หากต้องการออกงานฉุกเฉิน ระบบจะขออนุมัติลาป่วยให้',
        flags: {
          hasActivePeriod: true,
          isInsideShift: true,
          isOutsideShift: false,
          isCheckingIn: !periodStatusInfo.isActiveAttendance,
          isEarlyCheckIn: periodStatusInfo.timingFlags.isEarlyCheckIn,
          isLateCheckIn: periodStatusInfo.timingFlags.isLateCheckIn,
          isEarlyCheckOut: false,
          isLateCheckOut: false,
          isVeryLateCheckOut: false,
          isOvertime: false,
          isDayOffOvertime: false,
          isPendingOvertime: false,
          isAutoCheckIn: false,
          isAutoCheckOut: false,
          requireConfirmation: false,
          requiresAutoCompletion: false,
          hasPendingTransition: false,
          requiresTransition: false,
          isMorningShift: periodStatusInfo.shiftTiming.isMorningShift,
          isAfternoonShift: periodStatusInfo.shiftTiming.isAfternoonShift,
          isAfterMidshift: periodStatusInfo.shiftTiming.isAfterMidshift,
          isApprovedEarlyCheckout: false,
          isPlannedHalfDayLeave: false,
          isEmergencyLeave: true,
          isHoliday: window.isHoliday,
          isDayOff: Boolean(window.isDayOff),
          isManualEntry: attendance?.metadata?.source === 'manual',
        },
        metadata: {
          additionalInfo: {},
        },
      };
    }

    // Normal regular period validation
    const canCheckIn =
      !periodStatusInfo.isOvertimePeriod &&
      (!periodStatusInfo.isActiveAttendance ||
        periodStatusInfo.timingFlags.isEarlyCheckIn);

    const canCheckOut =
      periodStatusInfo.isActiveAttendance &&
      periodStatusInfo.shiftTiming.isAfterMidshift;

    const hasPendingTransition =
      window.nextPeriod?.type === PeriodType.OVERTIME;

    return {
      allowed: canCheckIn || canCheckOut,
      reason: this.getValidationReason({
        periodStatusInfo,
        window,
        attendance,
      }),
      flags: {
        hasActivePeriod: periodStatusInfo.isActiveAttendance,
        isInsideShift: true,
        isOutsideShift: false,
        isCheckingIn: !periodStatusInfo.isActiveAttendance,
        isEarlyCheckIn: periodStatusInfo.timingFlags.isEarlyCheckIn,
        isLateCheckIn: periodStatusInfo.timingFlags.isLateCheckIn,
        isEarlyCheckOut: false,
        isLateCheckOut: periodStatusInfo.timingFlags.isLateCheckOut,
        isVeryLateCheckOut: periodStatusInfo.timingFlags.isVeryLateCheckOut,
        isOvertime: false,
        isDayOffOvertime: false,
        isPendingOvertime: false,
        isAutoCheckIn: false,
        isAutoCheckOut: false,
        requireConfirmation: false,
        requiresAutoCompletion: false,
        hasPendingTransition,
        requiresTransition: false,
        isMorningShift: periodStatusInfo.shiftTiming.isMorningShift,
        isAfternoonShift: periodStatusInfo.shiftTiming.isAfternoonShift,
        isAfterMidshift: periodStatusInfo.shiftTiming.isAfterMidshift,
        isApprovedEarlyCheckout: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        isHoliday: window.isHoliday,
        isDayOff: Boolean(window.isDayOff),
        isManualEntry: attendance?.metadata?.source === 'manual',
      },
      metadata: {
        additionalInfo: {},
      },
    };
  }

  private determineOvertimeCheckoutStatus(
    now: Date,
    overtimeEnd: string,
    isActiveAttendance: boolean,
  ): OvertimeCheckoutStatus {
    try {
      const endTime = parseISO(`${format(now, 'yyyy-MM-dd')}T${overtimeEnd}`);
      const lateThresholdEnd = addMinutes(
        endTime,
        VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT,
      );

      // If not after end time, normal checkout
      if (now <= endTime) {
        return {
          shouldAutoComplete: false,
          allowManualCheckout: true,
          checkoutTime: null,
          reason: '',
        };
      }

      // If within late threshold
      if (now <= lateThresholdEnd) {
        return {
          shouldAutoComplete: false,
          allowManualCheckout: true,
          checkoutTime: null,
          reason: 'ลงเวลาออก OT ก่อนเวลาเลย 15 นาที',
        };
      }

      // Past late threshold - should auto complete at exact overtime end
      return {
        shouldAutoComplete: true,
        allowManualCheckout: false,
        checkoutTime: endTime,
        reason: 'เลยเวลาออก OT แล้ว ระบบจะทำการลงเวลาให้โดยอัตโนมัติ',
      };
    } catch (error) {
      console.error('Error determining overtime checkout status:', error);
      return {
        shouldAutoComplete: false,
        allowManualCheckout: false,
        checkoutTime: null,
        reason: 'Error processing overtime checkout',
      };
    }
  }

  private getValidationFlags(
    overrides: Partial<ValidationFlags>,
  ): ValidationFlags {
    return {
      // Basic check-in/out status
      isCheckingIn: false,
      isLateCheckIn: false,
      isEarlyCheckIn: false,
      isEarlyCheckOut: false,
      isLateCheckOut: false,
      isVeryLateCheckOut: false,

      // Period status
      hasActivePeriod: false,
      isInsideShift: false,
      isOutsideShift: false,
      isOvertime: false,
      isDayOffOvertime: false,
      isPendingOvertime: false,

      // Automation flags
      isAutoCheckIn: false,
      isAutoCheckOut: false,
      requireConfirmation: false,
      requiresAutoCompletion: false,

      // Transition flags
      hasPendingTransition: false,
      requiresTransition: false,

      // Shift timing
      isMorningShift: false,
      isAfternoonShift: false,
      isAfterMidshift: false,

      // Special cases
      isPlannedHalfDayLeave: false,
      isEmergencyLeave: false,
      isApprovedEarlyCheckout: false,
      isHoliday: false,
      isDayOff: false,
      isManualEntry: false,

      ...overrides,
    };
  }

  // getValidationReason needs to be updated to handle new format:
  private getValidationReason(params: {
    periodStatusInfo: PeriodStatusInfo;
    window: ShiftWindowResponse;
    attendance: AttendanceRecord | null;
  }): string {
    const { periodStatusInfo, window, attendance } = params;

    if (attendance?.checkTiming?.isEarlyCheckIn) {
      return 'Too early to check in';
    }
    if (attendance?.checkTiming?.isLateCheckIn) {
      return 'Late check-in';
    }
    if (
      window.nextPeriod?.type === PeriodType.OVERTIME &&
      periodStatusInfo.isActiveAttendance
    ) {
      return 'Please check out and transition to overtime period';
    }
    if (attendance?.checkTiming?.isLateCheckOut) {
      return `Late check-out (${attendance.checkTiming.lateCheckOutMinutes} minutes)`;
    }
    if (window.transition?.isInTransition) {
      return 'Pending period transition';
    }
    if (attendance?.metadata?.isDayOff || window.isDayOff) {
      return 'Day off';
    }
    if (window.isHoliday) {
      return 'Holiday';
    }
    return '';
  }

  // 3. Add helper functions for state validation
  private calculateMidShift(start: Date, end: Date): Date {
    const diffInMinutes = differenceInMinutes(end, start);
    return addMinutes(start, Math.floor(diffInMinutes / 2));
  }
}

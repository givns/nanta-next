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
  PeriodDefinition,
} from '@/types/attendance';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  addDays,
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

interface PeriodSequence {
  type: PeriodType;
  start: Date;
  end: Date;
  isOvernight: boolean;
}

function prioritizePeriods(
  periods: PeriodSequence[],
  currentTime: Date,
): PeriodSequence | null {
  // Sort periods chronologically, handling overnight periods
  const sortedPeriods = periods.sort((a, b) => {
    // If periods cross midnight, adjust comparison
    if (a.isOvernight || b.isOvernight) {
      // Complex comparison for overnight periods
      const adjustedA = a.end < a.start ? addDays(a.end, 1) : a.end;
      const adjustedB = b.end < b.start ? addDays(b.end, 1) : b.end;
      return adjustedA.getTime() - adjustedB.getTime();
    }
    return a.start.getTime() - b.start.getTime();
  });

  // Find current active or upcoming period
  for (const period of sortedPeriods) {
    // Check for overnight periods with special handling
    if (period.isOvernight) {
      // For overnight periods, check if current time is within the extended interval
      const extendedStart = period.start;
      const extendedEnd =
        period.end < period.start
          ? addDays(period.end, 1) // Cross midnight
          : period.end;

      if (
        isWithinInterval(currentTime, {
          start: extendedStart,
          end: extendedEnd,
        })
      ) {
        return period;
      }
    } else {
      // Regular period check
      if (
        isWithinInterval(currentTime, { start: period.start, end: period.end })
      ) {
        return period;
      }
    }
  }

  // If no period matches, find the next upcoming period
  const upcomingPeriod = sortedPeriods.find(
    (period) =>
      period.start > currentTime ||
      (period.isOvernight && addDays(period.end, 1) > currentTime),
  );

  return upcomingPeriod || null;
}

export class AttendanceEnhancementService {
  constructor(private readonly periodManager: PeriodManagementService) {}

  private determineCurrentPeriod(
    attendance: AttendanceRecord | null,
    window: ShiftWindowResponse,
    now: Date,
  ): { type: PeriodType; isActive: boolean } {
    // Enhanced logging for debugging
    console.log('Determining current period:', {
      currentTime: format(now, 'HH:mm:ss'),
      attendance: attendance
        ? {
            type: attendance.type,
            checkIn: attendance.CheckInTime,
            checkOut: attendance.CheckOutTime,
          }
        : null,
      overtimeInfo: window.overtimeInfo
        ? {
            startTime: window.overtimeInfo.startTime,
            endTime: window.overtimeInfo.endTime,
            isDayOff: window.overtimeInfo.isDayOffOvertime,
          }
        : null,
      shift: {
        start: window.shift.startTime,
        end: window.shift.endTime,
      },
    });

    // If there's an active attendance, use its type
    if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
      return {
        type: attendance.type,
        isActive: true,
      };
    }

    // Construct periods in chronological sequence
    const periods = this.buildChronologicalPeriods(window, now);

    // Find the relevant period (current or upcoming)
    const relevantPeriod = this.findRelevantPeriod(periods, now);

    return {
      type: relevantPeriod?.type || PeriodType.REGULAR,
      isActive: false,
    };
  }

  private buildChronologicalPeriods(
    window: ShiftWindowResponse,
    now: Date,
  ): PeriodDefinition[] {
    const periods: PeriodDefinition[] = [];

    // Check for early morning overtime
    if (window.overtimeInfo) {
      const otStart = this.parseTimeToMinutes(window.overtimeInfo.startTime);
      const shiftStart = this.parseTimeToMinutes(window.shift.startTime);

      if (otStart < shiftStart) {
        periods.push({
          type: PeriodType.OVERTIME,
          startTime: window.overtimeInfo.startTime,
          endTime: window.overtimeInfo.endTime,
          sequence: 1,
          isDayOff: window.overtimeInfo.isDayOffOvertime,
          isOvernight: this.isOvernightPeriod(
            window.overtimeInfo.startTime,
            window.overtimeInfo.endTime,
          ),
        });
      }
    }

    // Add regular shift period
    periods.push({
      type: PeriodType.REGULAR,
      startTime: window.shift.startTime,
      endTime: window.shift.endTime,
      sequence: 2,
      isOvernight: this.isOvernightPeriod(
        window.shift.startTime,
        window.shift.endTime,
      ),
    });

    // Add evening overtime if exists
    if (window.overtimeInfo) {
      const otStart = this.parseTimeToMinutes(window.overtimeInfo.startTime);
      const shiftStart = this.parseTimeToMinutes(window.shift.startTime);

      if (otStart >= shiftStart) {
        periods.push({
          type: PeriodType.OVERTIME,
          startTime: window.overtimeInfo.startTime,
          endTime: window.overtimeInfo.endTime,
          sequence: 3,
          isDayOff: window.overtimeInfo.isDayOffOvertime,
          isOvernight: this.isOvernightPeriod(
            window.overtimeInfo.startTime,
            window.overtimeInfo.endTime,
          ),
        });
      }
    }

    return this.sortPeriodsByChronologicalOrder(periods, now);
  }

  private sortPeriodsByChronologicalOrder(
    periods: PeriodDefinition[],
    now: Date,
  ): PeriodDefinition[] {
    return periods.sort((a, b) => {
      const [aHours, aMinutes] = a.startTime.split(':').map(Number);
      const [bHours, bMinutes] = b.startTime.split(':').map(Number);

      let aTotal = aHours * 60 + aMinutes;
      let bTotal = bHours * 60 + bMinutes;

      // Handle overnight periods
      const currentHour = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTotal = currentHour * 60 + currentMinutes;

      // If period is overnight and we're before midnight
      if (a.isOvernight && aTotal < currentTotal) {
        aTotal += 24 * 60;
      }
      if (b.isOvernight && bTotal < currentTotal) {
        bTotal += 24 * 60;
      }

      return aTotal - bTotal;
    });
  }

  private findRelevantPeriod(periods: PeriodDefinition[], now: Date) {
    const currentMinutes = this.getCurrentTimeInMinutes(now);

    // First, check for current period
    for (const period of periods) {
      const startMinutes = this.parseTimeToMinutes(period.startTime); // Changed from period.start
      let endMinutes = this.parseTimeToMinutes(period.endTime); // Changed from period.end

      // Adjust for overnight periods
      if (period.isOvernight && endMinutes < startMinutes) {
        endMinutes += 24 * 60; // Add 24 hours worth of minutes
      }

      // Check if we're approaching the period (within 30 minutes) or inside it
      const approachMinutes = startMinutes - 30;
      const adjustedCurrentMinutes =
        currentMinutes < approachMinutes
          ? currentMinutes + 24 * 60
          : currentMinutes;

      if (
        adjustedCurrentMinutes >= approachMinutes &&
        adjustedCurrentMinutes <= endMinutes
      ) {
        return period;
      }
    }

    // If no current period, find next upcoming period
    return periods.find((period) => {
      const startMinutes = this.parseTimeToMinutes(period.startTime); // Changed from period.start
      return currentMinutes < startMinutes;
    });
  }

  private parseTimeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private getCurrentTimeInMinutes(date: Date): number {
    return date.getHours() * 60 + date.getMinutes();
  }

  private determineTransitionContext(
    now: Date,
    periodState: ShiftWindowResponse,
    overtimeInfo?: OvertimeContext | null,
  ): TransitionInfo | undefined {
    if (!overtimeInfo) return undefined;

    // Add check for early overtime - no transition needed
    const isEarlyOvertime = this.isBeforeShift(
      overtimeInfo.startTime,
      periodState.shift.startTime,
    );
    if (isEarlyOvertime) {
      return undefined; // Early overtime should not have transition
    }

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
        timeWindow: currentState.timeWindow,
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
              isBeforeShift: this.isBeforeShift(
                window.overtimeInfo.startTime,
                window.shift.startTime,
              ),
            }
          : null,
      },
    });

    const statusInfo = this.determinePeriodStatusInfo(
      attendance,
      currentState,
      window,
      now,
    );

    // Handle active attendance validation first
    if (statusInfo.isActiveAttendance) {
      return this.createActiveAttendanceValidation(
        attendance!,
        currentState,
        window,
        now,
      );
    }

    // Handle early morning overtime validation
    if (
      window.overtimeInfo &&
      this.isBeforeShift(window.overtimeInfo.startTime, window.shift.startTime)
    ) {
      const validationResult = this.handleEarlyOvertimeValidation(
        window.overtimeInfo,
        now,
      );
      if (validationResult) {
        return {
          ...validationResult,
          flags: {
            ...validationResult.flags,
            requiresTransition: false, // Override for early overtime
            hasPendingTransition: false, // No transition needed for early overtime
          },
        };
      }
    }

    // Handle period transitions
    const transitionStatus = this.determineTransitionStatusInfo(
      statusInfo,
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

    // Default validation based on current period state
    return this.createDefaultPeriodValidation(currentState, window, now);
  }

  private handleEarlyOvertimeValidation(
    overtimeInfo: OvertimeContext,
    now: Date,
  ): StateValidation | null {
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
    );
    const earlyWindow = subMinutes(
      overtimeStart,
      VALIDATION_THRESHOLDS.EARLY_CHECKIN,
    );
    const isApproachingOvertime = now >= earlyWindow;

    if (isApproachingOvertime || now < overtimeStart) {
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
          isDayOffOvertime: Boolean(overtimeInfo.isDayOffOvertime),
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

    return null;
  }

  private createActiveAttendanceValidation(
    attendance: AttendanceRecord,
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): StateValidation {
    const isOvertimeSession = attendance.type === PeriodType.OVERTIME;
    const statusInfo = this.determinePeriodStatusInfo(
      attendance,
      currentState,
      window,
      now,
    );

    // Get validation reason
    const reason = this.getValidationReason({
      periodStatusInfo: statusInfo,
      window,
      attendance,
    });

    if (isOvertimeSession && window.overtimeInfo) {
      const overtimeStatus = this.determineOvertimeCheckoutStatus(
        now,
        window.overtimeInfo.endTime,
        true,
      );

      return {
        allowed: overtimeStatus?.allowManualCheckout ?? true,
        reason: overtimeStatus?.reason || reason,
        flags: this.getValidationFlags({
          hasActivePeriod: true,
          isCheckingIn: false,
          isOvertime: true,
          isDayOffOvertime: Boolean(window.overtimeInfo.isDayOffOvertime),
          isInsideShift: false,
          isOutsideShift: true,
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
                periodType: attendance.type,
              },
            },
      };
    }

    // Regular period validation
    return {
      allowed: true,
      reason: '',
      flags: this.getValidationFlags({
        hasActivePeriod: true,
        isCheckingIn: false,
        isOvertime: false,
        isInsideShift: true,
        isOutsideShift: false,
      }),
      metadata: {
        requiredAction: VALIDATION_ACTIONS.ACTIVE_SESSION,
        additionalInfo: {
          periodType: attendance.type,
        },
      },
    };
  }

  private createDefaultPeriodValidation(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): StateValidation {
    const currentPeriodStart = parseISO(currentState.timeWindow.start);
    const currentPeriodEnd = parseISO(currentState.timeWindow.end);

    const isWithinPeriod = isWithinInterval(now, {
      start: currentPeriodStart,
      end: currentPeriodEnd,
    });

    const reason = this.getValidationReason({
      periodStatusInfo: this.determinePeriodStatusInfo(
        null,
        currentState,
        window,
        now,
      ),
      window,
      attendance: null,
    });

    return {
      allowed: isWithinPeriod,
      reason: reason || (isWithinPeriod ? '' : 'ไม่อยู่ในช่วงเวลาทำงาน'),
      flags: this.getValidationFlags({
        hasActivePeriod: false,
        isCheckingIn: true,
        isInsideShift: isWithinPeriod,
        isOutsideShift: !isWithinPeriod,
        isOvertime: currentState.activity.isOvertime,
        isDayOffOvertime: currentState.activity.isDayOffOvertime,
      }),
      metadata: {
        requiredAction: VALIDATION_ACTIONS.REGULAR_CHECKIN,
        additionalInfo: {
          type: currentState.activity.isOvertime
            ? 'OVERTIME_PERIOD'
            : 'REGULAR_PERIOD',
          periodWindow: {
            start: format(currentPeriodStart, 'HH:mm'),
            end: format(currentPeriodEnd, 'HH:mm'),
          },
        },
      },
    };
  }

  private isBeforeShift(time1: string, time2: string): boolean {
    const [hours1, minutes1] = time1.split(':').map(Number);
    const [hours2, minutes2] = time2.split(':').map(Number);
    return hours1 * 60 + minutes1 < hours2 * 60 + minutes2;
  }

  private isOvernightPeriod(start: string, end: string): boolean {
    try {
      const [startHours, startMinutes] = start.split(':').map(Number);
      const [endHours, endMinutes] = end.split(':').map(Number);
      const startTotal = startHours * 60 + startMinutes;
      const endTotal = endHours * 60 + endMinutes;

      return endTotal < startTotal;
    } catch (error) {
      console.error('Error checking overnight period:', error);
      return false;
    }
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

      // Past late threshold - should auto complete but still allow manual checkout
      return {
        shouldAutoComplete: true,
        allowManualCheckout: true, // Changed to true to allow manual checkout
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

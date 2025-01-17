import {
  PeriodTransition,
  ShiftWindowResponse,
  UnifiedPeriodState,
  AttendanceRecord,
  PeriodDefinition,
  VALIDATION_THRESHOLDS,
} from '@/types/attendance';
import { ATTENDANCE_CONSTANTS } from '@/types/attendance/base';
import { PeriodType } from '@prisma/client';
import {
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
  addMinutes,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  addDays,
  subDays,
} from 'date-fns';

interface TransitionWindowConfig {
  EARLY_BUFFER: number; // minutes before shift end
  LATE_BUFFER: number; // minutes after shift end
}

const TRANSITION_CONFIG: TransitionWindowConfig = {
  EARLY_BUFFER: 5, // 5 minutes before shift end
  LATE_BUFFER: 15, // 15 minutes after shift end
};

export class PeriodManagementService {
  resolveCurrentPeriod(
    attendance: AttendanceRecord | null,
    periodState: ShiftWindowResponse,
    now: Date,
  ): UnifiedPeriodState {
    // Create periods array with proper chronological order

    console.log('Resolving Current Period - Detailed Input:', {
      attendanceRecord: attendance
        ? {
            id: attendance.id,
            type: attendance.type,
            checkInTime: attendance.CheckInTime,
            checkOutTime: attendance.CheckOutTime,
            overtimeState: attendance.overtimeState,
            isOvertime: attendance.isOvertime,
          }
        : null,
      periodState: {
        shift: periodState.shift,
        overtimeInfo: periodState.overtimeInfo,
      },
      currentTime: now,
    });

    // Create periods with more robust chronological handling
    const periods = this.buildPeriodSequence(periodState, now);

    // Explicitly handle active overtime first
    if (
      attendance?.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime
    ) {
      const activePeriod = periods.find(
        (p) =>
          p.type === PeriodType.OVERTIME &&
          this.isWithinOvernightPeriod(now, attendance.CheckInTime!, p),
      );

      if (activePeriod) {
        let periodStart = this.parseTimeWithContext(
          activePeriod.startTime,
          now,
        );
        let periodEnd = this.parseTimeWithContext(activePeriod.endTime, now);

        // Robust overnight handling
        if (activePeriod.isOvernight) {
          if (periodEnd < periodStart) {
            periodEnd = addDays(periodEnd, 1);
          }
          if (now < periodStart) {
            periodStart = subDays(periodStart, 1);
          }
        }

        return {
          type: PeriodType.OVERTIME,
          timeWindow: {
            start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
            end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          },
          activity: {
            isActive: true,
            checkIn: format(
              attendance.CheckInTime!,
              "yyyy-MM-dd'T'HH:mm:ss.SSS",
            ),
            checkOut: null,
            isOvertime: true,
            isDayOffOvertime: Boolean(activePeriod.isDayOff),
            isInsideShiftHours: false,
          },
          validation: {
            isWithinBounds: isWithinInterval(now, {
              start: periodStart,
              end: periodEnd,
            }),
            isEarly: now < periodStart,
            isLate: now > periodEnd,
            isOvernight: Boolean(activePeriod.isOvernight),
            isConnected: true,
          },
        };
      }
    }

    // Handle other active attendance
    if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
      // Find matching period for active attendance
      const activePeriod = periods.find((p) => p.type === attendance.type);

      if (!activePeriod) {
        return this.createDefaultPeriodState(now);
      }

      // Parse time with proper overnight handling
      const periodStart = this.parseTimeWithContext(
        activePeriod.startTime,
        now,
      );
      let periodEnd = this.parseTimeWithContext(activePeriod.endTime, now);

      if (activePeriod.isOvernight && periodEnd < periodStart) {
        periodEnd = addDays(periodEnd, 1);
      }

      return {
        type: activePeriod.type,
        timeWindow: {
          start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        },
        activity: {
          isActive: true,
          checkIn: format(attendance.CheckInTime, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          checkOut: null,
          isOvertime: activePeriod.type === PeriodType.OVERTIME,
          isDayOffOvertime: Boolean(activePeriod.isDayOff),
          isInsideShiftHours: activePeriod.type === PeriodType.REGULAR,
        },
        validation: {
          isWithinBounds: isWithinInterval(now, {
            start: periodStart,
            end: periodEnd,
          }),
          isEarly: false,
          isLate: now > periodEnd,
          isOvernight: Boolean(activePeriod.isOvernight),
          isConnected: attendance.overtimeState === 'COMPLETED',
        },
      };
    }

    // Find relevant period (either current or upcoming)
    const relevantPeriod = this.findRelevantPeriod(periods, now);
    if (!relevantPeriod) {
      return this.createDefaultPeriodState(now);
    }

    // Check if we're in a waiting state for overtime
    const isWaitingForOvertime = this.isWaitingForOvertimePeriod(
      now,
      periods,
      attendance,
    );

    if (isWaitingForOvertime) {
      const overtimePeriod = periods.find(
        (p) => p.type === PeriodType.OVERTIME,
      );
      if (overtimePeriod) {
        const periodStart = this.parseTimeWithContext(
          overtimePeriod.startTime,
          now,
        );
        let periodEnd = this.parseTimeWithContext(overtimePeriod.endTime, now);

        if (overtimePeriod.isOvernight && periodEnd < periodStart) {
          periodEnd = addDays(periodEnd, 1);
        }

        return {
          type: PeriodType.OVERTIME,
          timeWindow: {
            start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
            end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          },
          activity: {
            isActive: false,
            checkIn: null,
            checkOut: null,
            isOvertime: true,
            isDayOffOvertime: Boolean(overtimePeriod.isDayOff),
            isInsideShiftHours: false,
          },
          validation: {
            isWithinBounds: false,
            isEarly: true,
            isLate: false,
            isOvernight: Boolean(overtimePeriod.isOvernight),
            isConnected: true,
          },
        };
      }
    }

    // Parse time with proper overnight handling for default state
    const periodStart = this.parseTimeWithContext(
      relevantPeriod.startTime,
      now,
    );
    let periodEnd = this.parseTimeWithContext(relevantPeriod.endTime, now);

    // Adjust end time for overnight periods
    if (relevantPeriod.isOvernight && periodEnd < periodStart) {
      periodEnd = addDays(periodEnd, 1);
    }

    const isWithinPeriod = isWithinInterval(now, {
      start: periodStart,
      end: periodEnd,
    });

    return {
      type: relevantPeriod.type,
      timeWindow: {
        start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
      activity: {
        isActive: false,
        checkIn: null,
        checkOut: null,
        isOvertime: relevantPeriod.type === PeriodType.OVERTIME,
        isDayOffOvertime: Boolean(relevantPeriod.isDayOff),
        isInsideShiftHours: relevantPeriod.type === PeriodType.REGULAR,
      },
      validation: {
        isWithinBounds: isWithinPeriod,
        isEarly: now < periodStart,
        isLate: now > periodEnd,
        isOvernight: Boolean(relevantPeriod.isOvernight),
        isConnected: Boolean(periodState.overtimeInfo),
      },
    };
  }

  private isWaitingForOvertimePeriod(
    now: Date,
    periods: PeriodDefinition[],
    lastAttendance: AttendanceRecord | null,
  ): boolean {
    // Check if there's a completed regular period
    const hasCompletedRegular =
      lastAttendance?.type === PeriodType.REGULAR &&
      lastAttendance.CheckOutTime !== null && // Check explicitly for null
      lastAttendance.state === 'PRESENT';

    if (!hasCompletedRegular || !lastAttendance?.CheckOutTime) return false; // Early return if no checkout time

    // Find next overtime period
    const nextOvertime = periods.find(
      (p) =>
        p.type === PeriodType.OVERTIME &&
        this.parseTimeWithContext(p.startTime, now) > now,
    );

    if (!nextOvertime) return false;

    const overtimeStart = this.parseTimeWithContext(
      nextOvertime.startTime,
      now,
    );
    const approachWindow = subMinutes(overtimeStart, 30);

    // Now we can safely use CheckOutTime as we've checked it's not null
    return now >= lastAttendance.CheckOutTime && now <= overtimeStart;
  }

  private buildPeriodSequence(
    periodState: ShiftWindowResponse,
    now: Date,
  ): PeriodDefinition[] {
    const periods: PeriodDefinition[] = [];

    // Add early morning overtime if exists
    if (
      periodState.overtimeInfo &&
      this.isEarlyMorningOvertime(
        periodState.overtimeInfo.startTime,
        periodState.shift.startTime,
      )
    ) {
      periods.push({
        type: PeriodType.OVERTIME,
        startTime: periodState.overtimeInfo.startTime,
        endTime: periodState.overtimeInfo.endTime,
        sequence: 1,
        isOvernight: this.isOvernightPeriod(
          periodState.overtimeInfo.startTime,
          periodState.overtimeInfo.endTime,
        ),
        isDayOff: periodState.overtimeInfo.isDayOffOvertime,
      });
    }

    // First check if we have completed regular period and pending overtime
    if (periodState.overtimeInfo) {
      const otStart = this.parseTimeWithContext(
        periodState.overtimeInfo.startTime,
        now,
      );
      const regularEnd = this.parseTimeWithContext(
        periodState.shift.endTime,
        now,
      );

      // If we're between regular end and overtime start
      if (now > regularEnd && now < otStart) {
        // Only include overtime period as it's the relevant one
        periods.push({
          type: PeriodType.OVERTIME,
          startTime: periodState.overtimeInfo.startTime,
          endTime: periodState.overtimeInfo.endTime,
          sequence: 3,
          isOvernight: this.isOvernightPeriod(
            periodState.overtimeInfo.startTime,
            periodState.overtimeInfo.endTime,
          ),
          isDayOff: periodState.overtimeInfo.isDayOffOvertime,
        });

        return periods; // Return only overtime period
      }
    }

    // Add regular shift
    periods.push({
      type: PeriodType.REGULAR,
      startTime: periodState.shift.startTime,
      endTime: periodState.shift.endTime,
      sequence: 2,
      isOvernight: this.isOvernightPeriod(
        periodState.shift.startTime,
        periodState.shift.endTime,
      ),
    });

    // Add evening overtime if exists
    if (
      periodState.overtimeInfo &&
      !this.isEarlyMorningOvertime(
        periodState.overtimeInfo.startTime,
        periodState.shift.startTime,
      )
    ) {
      periods.push({
        type: PeriodType.OVERTIME,
        startTime: periodState.overtimeInfo.startTime,
        endTime: periodState.overtimeInfo.endTime,
        sequence: 3,
        isOvernight: this.isOvernightPeriod(
          periodState.overtimeInfo.startTime,
          periodState.overtimeInfo.endTime,
        ),
        isDayOff: periodState.overtimeInfo.isDayOffOvertime,
      });
    }

    return this.sortPeriodsByChronologicalOrder(periods, now);
  }

  private findRelevantPeriod(
    periods: PeriodDefinition[],
    now: Date,
    lastCompletedPeriod?: { type: PeriodType; checkOutTime: Date } | null,
    lastAttendance?: AttendanceRecord | null,
  ): PeriodDefinition | null {
    // 1. First check if we have a completed period
    if (lastCompletedPeriod) {
      const completedPeriodEnd = lastCompletedPeriod.checkOutTime;
      const nextPeriod = periods.find((period) => {
        const periodStart = this.parseTimeWithContext(period.startTime, now);
        return (
          period.type !== lastCompletedPeriod.type &&
          periodStart > completedPeriodEnd
        );
      });

      if (lastCompletedPeriod?.type === PeriodType.REGULAR) {
        const overtimePeriod = periods.find(
          (p) => p.type === PeriodType.OVERTIME,
        );
        if (overtimePeriod) {
          const overtimeStart = this.parseTimeWithContext(
            overtimePeriod.startTime,
            now,
          );
          // Even if not yet in approach window, return overtime period as next
          if (now <= overtimeStart) {
            return overtimePeriod;
          }
        }
      }

      if (
        lastAttendance?.type === PeriodType.OVERTIME &&
        !lastAttendance?.CheckOutTime
      ) {
        return (
          periods.find(
            (p) =>
              p.type === PeriodType.OVERTIME &&
              this.isWithinOvernightPeriod(now, lastAttendance.CheckInTime!, p),
          ) ?? null
        );
      }

      // If we're in between completed period and next period, return next period
      if (nextPeriod) {
        const nextStart = this.parseTimeWithContext(nextPeriod.startTime, now);
        const approachWindow = subMinutes(nextStart, 30);
        if (now >= approachWindow) {
          return nextPeriod;
        }
        return null; // No valid period if we're not approaching next period
      }
    }

    // 2. Regular period checking
    for (const period of periods) {
      const periodStart = this.parseTimeWithContext(period.startTime, now);
      const periodEnd = this.parseTimeWithContext(period.endTime, now);
      const adjustedEnd =
        period.isOvernight && periodEnd < periodStart
          ? addDays(periodEnd, 1)
          : periodEnd;

      const approachWindow = subMinutes(periodStart, 30);
      if (now >= approachWindow && now <= adjustedEnd) {
        return period;
      }
    }

    // If no current period, get next upcoming one
    return (
      periods.find((period) => {
        const periodStart = this.parseTimeWithContext(period.startTime, now);
        return now < periodStart;
      }) || null
    );
  }

  private resolveActivePeriod(
    attendance: AttendanceRecord,
    periods: PeriodDefinition[],
    now: Date,
  ): UnifiedPeriodState {
    // Find the active period matching attendance type
    const activePeriod = periods.find(
      (period) => period.type === attendance.type,
    );
    if (!activePeriod) {
      return this.createDefaultPeriodState(now);
    }

    // Parse time with proper overnight handling
    const periodStart = this.parseTimeWithContext(activePeriod.startTime, now);
    let periodEnd = this.parseTimeWithContext(activePeriod.endTime, now);

    // Adjust end time for overnight periods
    if (activePeriod.isOvernight && periodEnd < periodStart) {
      periodEnd = addDays(periodEnd, 1);
    }

    return {
      type: activePeriod.type,
      timeWindow: {
        start: format(periodStart, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(periodEnd, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
      activity: {
        isActive: true,
        checkIn: format(
          new Date(attendance.CheckInTime!),
          "yyyy-MM-dd'T'HH:mm:ss.SSS",
        ),
        checkOut: null,
        isOvertime: activePeriod.type === PeriodType.OVERTIME,
        isDayOffOvertime: Boolean(activePeriod.isDayOff),
        isInsideShiftHours: activePeriod.type === PeriodType.REGULAR,
      },
      validation: {
        isWithinBounds: isWithinInterval(now, {
          start: periodStart,
          end: periodEnd,
        }),
        isEarly: now < periodStart,
        isLate: false, // Don't mark as late during active period
        isOvernight: activePeriod.isOvernight || false,
        isConnected: attendance.overtimeState === 'COMPLETED',
      },
    };
  }

  private createDefaultPeriodState(now: Date): UnifiedPeriodState {
    return {
      type: PeriodType.REGULAR,
      timeWindow: {
        start: format(startOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(endOfDay(now), "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      },
      activity: {
        isActive: false,
        checkIn: null,
        checkOut: null,
        isOvertime: false,
        isDayOffOvertime: false,
        isInsideShiftHours: false,
      },
      validation: {
        isWithinBounds: false,
        isEarly: false,
        isLate: false,
        isOvernight: false,
        isConnected: false,
      },
    };
  }

  private isEarlyMorningOvertime(
    overtimeStart: string,
    shiftStart: string,
  ): boolean {
    const [otHours, otMinutes] = overtimeStart.split(':').map(Number);
    const [shiftHours, shiftMinutes] = shiftStart.split(':').map(Number);

    return otHours * 60 + otMinutes < shiftHours * 60 + shiftMinutes;
  }

  private sortPeriodsByChronologicalOrder(
    periods: PeriodDefinition[],
    now: Date,
  ): PeriodDefinition[] {
    return periods.sort((a, b) => {
      const aTime = this.parseTimeWithContext(a.startTime, now);
      const bTime = this.parseTimeWithContext(b.startTime, now);
      return aTime.getTime() - bTime.getTime();
    });
  }

  // Helper method for time context parsing
  private parseTimeWithContext(timeString: string, referenceDate: Date) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const parsedTime = new Date(referenceDate);
    parsedTime.setHours(hours, minutes, 0, 0);
    return parsedTime;
  }

  private validateCheckTiming(
    now: Date,
    shiftStart: Date,
    shiftEnd: Date,
    type: PeriodType,
  ): { isEarly: boolean; isLate: boolean; minutesDeviation: number } {
    try {
      const earlyThreshold = subMinutes(
        shiftStart,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      );
      const lateThreshold = addMinutes(
        shiftStart,
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
      );

      const isEarly = now >= earlyThreshold && now < shiftStart;
      const isLate = now > lateThreshold;
      const minutesDeviation =
        type === PeriodType.REGULAR ? differenceInMinutes(now, shiftStart) : 0;

      return {
        isEarly,
        isLate,
        minutesDeviation: Math.abs(minutesDeviation),
      };
    } catch (error) {
      console.error('Check timing validation error:', error);
      return { isEarly: false, isLate: false, minutesDeviation: 0 };
    }
  }

  calculatePeriodTransitions(
    currentState: UnifiedPeriodState,
    window: ShiftWindowResponse,
    now: Date,
  ): PeriodTransition[] {
    // Don't attempt transitions for invalid shifts
    if (!window.overtimeInfo || !window.shift?.endTime || !window.shift?.id) {
      return [];
    }

    try {
      const shiftEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${window.shift.endTime}`,
      );

      // Updated transition window calculation
      const transitionWindow = {
        start: subMinutes(shiftEnd, TRANSITION_CONFIG.EARLY_BUFFER),
        end: addMinutes(shiftEnd, TRANSITION_CONFIG.LATE_BUFFER),
      };

      const isInTransitionWindow = isWithinInterval(now, transitionWindow);
      const hasUpcomingOvertime =
        window.overtimeInfo.startTime === window.shift.endTime;

      console.log('Transition calculation:', {
        currentTime: format(now, 'HH:mm'),
        shift: { end: format(shiftEnd, 'HH:mm') },
        window: {
          start: format(transitionWindow.start, 'HH:mm'),
          end: format(transitionWindow.end, 'HH:mm'),
        },
        conditions: {
          isInWindow: isInTransitionWindow,
          hasOvertime: hasUpcomingOvertime,
        },
      });

      if (isInTransitionWindow && hasUpcomingOvertime) {
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
    } catch (error) {
      console.error('Error calculating transitions:', error);
    }

    return [];
  }

  private isOvernightPeriod(start: string, end: string): boolean {
    try {
      const startTime = start.split(':').map(Number);
      const endTime = end.split(':').map(Number);

      // If end time is less than start time, it's overnight
      if (
        endTime[0] < startTime[0] ||
        (endTime[0] === startTime[0] && endTime[1] < startTime[1])
      ) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking overnight period:', error);
      return false;
    }
  }

  // Add this helper method to the class
  private isWithinOvertimeCheckout(
    now: Date,
    overtimeRecord: AttendanceRecord,
    periods: PeriodDefinition[],
  ): boolean {
    try {
      // Find the corresponding overtime period
      const overtimePeriod = periods.find(
        (p) => p.type === PeriodType.OVERTIME,
      );

      if (!overtimePeriod) return false;

      // Parse period end time with context
      const periodEnd = this.parseTimeWithContext(
        overtimePeriod.endTime,
        overtimeRecord.CheckInTime!,
      );

      // Adjust for overnight periods
      let adjustedPeriodEnd = periodEnd;
      if (
        overtimePeriod.isOvernight &&
        periodEnd <
          this.parseTimeWithContext(
            overtimePeriod.startTime,
            overtimeRecord.CheckInTime!,
          )
      ) {
        adjustedPeriodEnd = addDays(periodEnd, 1);
      }

      // Define checkout window (e.g., 30 minutes after period end)
      const checkoutWindow = {
        start: adjustedPeriodEnd,
        end: addMinutes(
          adjustedPeriodEnd,
          VALIDATION_THRESHOLDS.OVERTIME_CHECKOUT,
        ),
      };

      // Log detailed checkout validation
      console.log('Overtime Checkout Validation:', {
        now: format(now, 'yyyy-MM-dd HH:mm:ss'),
        periodEnd: format(adjustedPeriodEnd, 'yyyy-MM-dd HH:mm:ss'),
        checkoutWindowStart: format(
          checkoutWindow.start,
          'yyyy-MM-dd HH:mm:ss',
        ),
        checkoutWindowEnd: format(checkoutWindow.end, 'yyyy-MM-dd HH:mm:ss'),
        isWithinWindow: isWithinInterval(now, checkoutWindow),
      });

      return isWithinInterval(now, checkoutWindow);
    } catch (error) {
      console.error('Error validating overtime checkout:', error);
      return false;
    }
  }

  private isWithinOvernightPeriod(
    now: Date,
    checkInTime: Date,
    period: PeriodDefinition,
  ): boolean {
    let periodStart = this.parseTimeWithContext(period.startTime, checkInTime);
    let periodEnd = this.parseTimeWithContext(period.endTime, checkInTime);

    if (period.isOvernight && periodEnd < periodStart) {
      periodEnd = addDays(periodEnd, 1);
    }

    // If current time is before midnight, adjust start time to previous day
    if (now < periodStart) {
      periodStart = subDays(periodStart, 1);
    }

    return isWithinInterval(now, { start: periodStart, end: periodEnd });
  }

  public checkIfEarly(now: Date, start: Date): boolean {
    try {
      return isWithinInterval(now, {
        start: subMinutes(start, ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD),
        end: start,
      });
    } catch (error) {
      console.error('Error checking early status:', error);
      return false;
    }
  }

  private checkIfLate(now: Date, start: Date): boolean {
    try {
      // Add debug logging
      const lateThreshold = addMinutes(
        start,
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
      );
      const isLate = now > lateThreshold;

      console.log('Late check calculation:', {
        currentTime: format(now, 'HH:mm'),
        shiftStart: format(start, 'HH:mm'),
        lateThreshold: format(lateThreshold, 'HH:mm'),
        isLate,
        minutesLate: differenceInMinutes(now, start),
      });

      return isLate;
    } catch (error) {
      console.error('Error checking late status:', error);
      return false;
    }
  }
}

// services/Attendance/utils/StatusHelpers.ts

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  AttendanceCompositeStatus,
  StatusUpdateResult,
  ApprovedOvertimeInfo,
} from '@/types/attendance/status';
import { ProcessingOptions } from '@/types/attendance/processing';
import { addDays, format, isWithinInterval, parseISO } from 'date-fns';
import { AttendanceRecord } from '@/types/attendance/records';

export class StatusHelpers {
  static processStatusTransition(
    currentStatus: AttendanceCompositeStatus,
    options: ProcessingOptions,
  ): StatusUpdateResult {
    const newStatus = this.determineNewState(currentStatus, options);

    return {
      stateChange: {
        state: {
          previous: currentStatus.state,
          current: newStatus.state,
        },
        checkStatus: {
          previous: currentStatus.checkStatus,
          current: newStatus.checkStatus,
        },
        overtime:
          options.isOvertime || currentStatus.isOvertime
            ? {
                previous: {
                  isOvertime: currentStatus.isOvertime,
                  state: currentStatus.overtimeState,
                },
                current: {
                  isOvertime: newStatus.isOvertime,
                  state: newStatus.overtimeState,
                },
              }
            : undefined,
      },
      timestamp: new Date(),
      reason: this.generateStatusUpdateReason(
        currentStatus,
        newStatus,
        options,
      ),
      metadata: {
        source: options.isManualEntry ? 'manual' : 'system',
        location: options.location
          ? {
              latitude: options.location.lat,
              longitude: options.location.lng,
              accuracy: options.location.accuracy,
            }
          : undefined,
        updatedBy: options.updatedBy || 'system',
        checkTime: format(new Date(options.checkTime), "yyyy-MM-dd'T'HH:mm:ss"),
      },
    };
  }

  static determineNewState(
    currentStatus: AttendanceCompositeStatus,
    options: ProcessingOptions,
  ): AttendanceCompositeStatus {
    const { isCheckIn, isOvertime } = options;

    if (isCheckIn) {
      return {
        state: isOvertime
          ? AttendanceState.OVERTIME
          : AttendanceState.INCOMPLETE,
        checkStatus: CheckStatus.CHECKED_IN,
        isOvertime: !!isOvertime, // Ensure isOvertime is always a boolean value
        overtimeState: isOvertime ? OvertimeState.IN_PROGRESS : undefined,
      };
    }

    return {
      state: AttendanceState.PRESENT,
      checkStatus: CheckStatus.CHECKED_OUT,
      isOvertime: isOvertime || currentStatus.isOvertime,
      overtimeState: isOvertime ? OvertimeState.COMPLETED : undefined,
    };
  }

  static canTransitionToState(
    current: AttendanceCompositeStatus,
    target: AttendanceCompositeStatus,
  ): boolean {
    // Cannot go back to previous states
    if (
      current.checkStatus === CheckStatus.CHECKED_OUT &&
      target.checkStatus === CheckStatus.CHECKED_IN
    ) {
      return false;
    }

    // Cannot start overtime without checking out regular period
    if (
      !current.isOvertime &&
      target.isOvertime &&
      current.checkStatus !== CheckStatus.CHECKED_OUT
    ) {
      return false;
    }

    return true;
  }

  private static generateStatusUpdateReason(
    currentStatus: AttendanceCompositeStatus,
    newStatus: AttendanceCompositeStatus,
    options: ProcessingOptions,
  ): string {
    if (options.reason) return options.reason;

    if (newStatus.isOvertime && !currentStatus.isOvertime) {
      return 'Started overtime period';
    }

    if (options.isCheckIn) {
      return newStatus.isOvertime ? 'Overtime check-in' : 'Regular check-in';
    }

    return newStatus.isOvertime ? 'Overtime check-out' : 'Regular check-out';
  }

  static isInOvertimePeriod(
    now: Date,
    overtime: ApprovedOvertimeInfo | null,
  ): boolean {
    if (!overtime) return false;
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`,
    );
    let overtimeEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`,
    );

    // Handle overnight overtime
    if (overtimeEnd < overtimeStart) {
      overtimeEnd = addDays(overtimeEnd, 1);
    }

    return isWithinInterval(now, { start: overtimeStart, end: overtimeEnd });
  }

  static getDisplayStatus(
    attendance: AttendanceRecord,
    isHoliday: boolean = false,
  ): string {
    if (isHoliday) return 'holiday';
    if (attendance.state === AttendanceState.OFF) return 'day-off';

    const details: string[] = [];

    if (attendance.isLateCheckIn) details.push('late-check-in');
    if (attendance.isEarlyCheckIn) details.push('early-check-in');
    if (attendance.isLateCheckOut) details.push('late-check-out');
    if (attendance.overtimeState === OvertimeState.IN_PROGRESS)
      details.push('overtime');

    return details.length > 0 ? details.join('-') : 'on-time';
  }

  /** @deprecated Use determineNewState instead */
  static calculateStatus(status: string): AttendanceState {
    return AttendanceState.PRESENT;
  }
}

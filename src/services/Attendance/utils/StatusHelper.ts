// services/Attendance/utils/StatusHelper.ts

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import {
  StatusUpdateResult,
  AttendanceCompositeStatus,
} from '../../../types/attendance';

export class StatusHelpers {
  static processStatusTransition(
    currentStatus: AttendanceCompositeStatus,
    options: {
      isCheckIn: boolean;
      isOvertime?: boolean;
      isManualEntry?: boolean;
      reason?: string;
      source?: 'system' | 'manual' | 'auto';
      coordinates?: { latitude: number; longitude: number; accuracy?: number };
      updatedBy?: string;
    },
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
      reason:
        options.reason ||
        this.generateStatusUpdateReason(currentStatus, newStatus, options),
      metadata: {
        source: options.source || 'system',
        location: options.coordinates,
        updatedBy: options.updatedBy || 'system',
      },
    };
  }

  static determineNewState(
    currentStatus: AttendanceCompositeStatus,
    options: { isCheckIn: boolean; isOvertime?: boolean },
  ): AttendanceCompositeStatus {
    const { isCheckIn, isOvertime } = options;

    if (isCheckIn) {
      return {
        state: isOvertime
          ? AttendanceState.OVERTIME
          : AttendanceState.INCOMPLETE,
        checkStatus: CheckStatus.CHECKED_IN,
        isOvertime: !!isOvertime,
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

  // Status validation helpers
  static canCheckIn(status: AttendanceCompositeStatus): boolean {
    return status.checkStatus !== CheckStatus.CHECKED_IN;
  }

  static canCheckOut(status: AttendanceCompositeStatus): boolean {
    return status.checkStatus === CheckStatus.CHECKED_IN;
  }

  static canTransitionToOvertime(status: AttendanceCompositeStatus): boolean {
    return (
      !status.isOvertime &&
      status.checkStatus === CheckStatus.CHECKED_OUT &&
      status.state === AttendanceState.PRESENT
    );
  }

  static isInOvertime(status: AttendanceCompositeStatus): boolean {
    return (
      status.isOvertime && status.overtimeState === OvertimeState.IN_PROGRESS
    );
  }

  static isOvertimeComplete(status: AttendanceCompositeStatus): boolean {
    return (
      status.isOvertime && status.overtimeState === OvertimeState.COMPLETED
    );
  }

  static isActive(status: AttendanceCompositeStatus): boolean {
    return status.checkStatus === CheckStatus.CHECKED_IN;
  }

  static isComplete(status: AttendanceCompositeStatus): boolean {
    return status.checkStatus === CheckStatus.CHECKED_OUT;
  }

  static canStartNewPeriod(
    status: AttendanceCompositeStatus,
    periodType: PeriodType,
  ): boolean {
    if (periodType === PeriodType.OVERTIME) {
      return this.canTransitionToOvertime(status);
    }
    return this.canCheckIn(status);
  }

  static validateStateTransition(
    from: AttendanceCompositeStatus,
    to: AttendanceCompositeStatus,
  ): { isValid: boolean; reason?: string } {
    // Can't go back to checked-in state
    if (
      from.checkStatus === CheckStatus.CHECKED_OUT &&
      to.checkStatus === CheckStatus.CHECKED_IN
    ) {
      return { isValid: false, reason: 'Cannot check in after checking out' };
    }

    // Can't start overtime without completing regular period
    if (
      !from.isOvertime &&
      to.isOvertime &&
      from.checkStatus !== CheckStatus.CHECKED_OUT
    ) {
      return {
        isValid: false,
        reason: 'Must complete regular period before starting overtime',
      };
    }

    // Can't change overtime state incorrectly
    if (
      from.overtimeState === OvertimeState.COMPLETED &&
      to.overtimeState === OvertimeState.IN_PROGRESS
    ) {
      return { isValid: false, reason: 'Cannot restart completed overtime' };
    }

    return { isValid: true };
  }

  private static generateStatusUpdateReason(
    currentStatus: AttendanceCompositeStatus,
    newStatus: AttendanceCompositeStatus,
    options: { isCheckIn: boolean; reason?: string },
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

  static getDisplayStatus(status: AttendanceCompositeStatus): string {
    // Holiday and day-off checks
    if (status.state === AttendanceState.HOLIDAY) return 'holiday';
    if (status.state === AttendanceState.OFF) return 'day-off';

    // Handle overtime period
    if (status.isOvertime) {
      // Only show overtime states if there's actual overtime activity
      switch (status.overtimeState) {
        case OvertimeState.IN_PROGRESS:
          return 'ลงเวลาเข้า OT แล้ว';
        case OvertimeState.COMPLETED:
          return 'ทำ OT เสร็จแล้ว';
        default:
          return 'ยังไม่ลงเวลา OT';
      }
    }

    // Handle regular shift period
    switch (status.checkStatus) {
      case CheckStatus.CHECKED_IN:
        if (status.state === AttendanceState.PRESENT) {
          // If there's approved overtime after shift
          if (status.overtimeState === OvertimeState.NOT_STARTED) {
            return 'ลงเวลาเข้างานแล้ว, มี OT รออยู่';
          }
          return 'ลงเวลาเข้างานแล้ว';
        }
        return 'ลงเวลาเข้างานแล้ว';

      case CheckStatus.CHECKED_OUT:
        // If there's approved overtime after regular shift
        if (status.overtimeState === OvertimeState.NOT_STARTED) {
          return 'ลงเวลาออกงานแล้ว, รอเข้า OT';
        }
        return 'ลงเวลาออกงานแล้ว';

      default:
        // Default state - no check-in yet
        return 'ยังไม่ลงเวลา';
    }
  }
}

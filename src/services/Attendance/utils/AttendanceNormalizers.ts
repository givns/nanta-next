// services/Attendance/utils/AttendanceNormalizers.ts

import { AttendanceState, CheckStatus, OvertimeState } from '@prisma/client';
import { TimeEntryStatus, PeriodType } from '../../../types/attendance/status';

export class AttendanceNormalizers {
  static normalizeAttendanceState(state: string): AttendanceState {
    const normalized = state.toLowerCase();
    switch (normalized) {
      case 'present':
        return AttendanceState.PRESENT;
      case 'absent':
        return AttendanceState.ABSENT;
      case 'incomplete':
        return AttendanceState.INCOMPLETE;
      case 'holiday':
        return AttendanceState.HOLIDAY;
      case 'off':
        return AttendanceState.OFF;
      case 'overtime':
        return AttendanceState.OVERTIME;
      default:
        console.warn(`Invalid state "${state}" normalized to 'absent'`);
        return AttendanceState.ABSENT;
    }
  }

  static normalizeCheckStatus(status: string): CheckStatus {
    const normalized = status.toLowerCase().replace(/-/g, '_');
    switch (normalized) {
      case 'checked_in':
        return CheckStatus.CHECKED_IN;
      case 'checked_out':
        return CheckStatus.CHECKED_OUT;
      default:
        return CheckStatus.PENDING;
    }
  }

  static normalizeTimeEntryStatus(status: string): TimeEntryStatus {
    return status.toUpperCase() === 'COMPLETED'
      ? TimeEntryStatus.COMPLETED
      : TimeEntryStatus.IN_PROGRESS;
  }

  static normalizePeriodType(type: string): PeriodType {
    return type.toLowerCase() === 'overtime'
      ? PeriodType.OVERTIME
      : PeriodType.REGULAR;
  }

  static normalizeOvertimeState(
    state: string | undefined,
  ): OvertimeState | undefined {
    if (!state) return undefined;

    const normalized = state.toLowerCase().replace(/-/g, '_');
    switch (normalized) {
      case 'not_started':
        return OvertimeState.NOT_STARTED;
      case 'in_progress':
      case 'overtime_started':
        return OvertimeState.IN_PROGRESS;
      case 'completed':
      case 'overtime_ended':
        return OvertimeState.COMPLETED;
      default:
        return undefined;
    }
  }

  /** @deprecated Use new specific normalize methods */
  static normalizeStatus(status: string): string {
    return status.toLowerCase();
  }
}

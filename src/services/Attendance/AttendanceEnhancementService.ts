// services/Attendance/AttendanceEnhancementService.ts

import {
  AttendanceRecord,
  Period,
  PeriodType,
  EnhancedAttendanceStatus,
  ApprovedOvertimeInfo,
  PeriodWindow,
  PeriodStatus,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { isAfter, parseISO, format, isWithinInterval } from 'date-fns';

export class AttendanceEnhancementService {
  async enhanceAttendanceStatus(
    attendance: AttendanceRecord | null,
    currentPeriod: Period | null,
    overtimeInfo?: ApprovedOvertimeInfo | null,
  ): Promise<EnhancedAttendanceStatus> {
    const now = getCurrentTime();
    const enhancedStatus = this.createInitialStatus(currentPeriod);

    if (!currentPeriod) return enhancedStatus;

    if (attendance?.CheckInTime) {
      enhancedStatus.lastCheckIn = {
        time: attendance.CheckInTime,
        periodType: attendance.type,
        isOvertime: attendance.isOvertime,
      };
    }

    if (attendance?.CheckOutTime) {
      enhancedStatus.lastCheckOut = {
        time: attendance.CheckOutTime,
        periodType: attendance.type,
        isOvertime: attendance.isOvertime,
      };
    }

    const periodWindow = this.createPeriodWindow(currentPeriod, attendance);
    const overtimePeriod = overtimeInfo
      ? this.createOvertimePeriodWindow(overtimeInfo, now, attendance)
      : null;

    // Update current period based on check-in status and time
    if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
      enhancedStatus.currentPeriod = {
        ...currentPeriod,
        status: PeriodStatus.ACTIVE,
      };
    }

    const validPeriodWindows = [periodWindow, overtimePeriod].filter(
      (p): p is PeriodWindow => p !== null,
    );

    enhancedStatus.missingEntries = this.getMissingEntries(
      attendance,
      validPeriodWindows,
      now,
    );

    enhancedStatus.pendingTransitions = this.getPendingTransitions(
      validPeriodWindows,
      attendance,
    );

    return enhancedStatus;
  }

  private createInitialStatus(
    currentPeriod: Period | null,
  ): EnhancedAttendanceStatus {
    return {
      currentPeriod,
      lastCheckIn: null,
      lastCheckOut: null,
      missingEntries: [],
      pendingTransitions: [],
    };
  }

  private createPeriodWindow(
    period: Period,
    attendance: AttendanceRecord | null,
  ): PeriodWindow {
    const now = getCurrentTime();
    const isWithinPeriod = isWithinInterval(now, {
      start: period.startTime,
      end: period.endTime,
    });

    // Determine status based on both time and attendance
    let status = PeriodStatus.PENDING;
    if (attendance?.CheckInTime) {
      if (!attendance.CheckOutTime && isWithinPeriod) {
        status = PeriodStatus.ACTIVE;
      } else if (attendance.CheckOutTime) {
        status = PeriodStatus.COMPLETED;
      }
    }

    return {
      start: period.startTime,
      end: period.endTime,
      type: period.type,
      overtimeId: period.overtimeId,
      isConnected: period.isConnected || false,
      status,
    };
  }

  private createOvertimePeriodWindow(
    overtime: ApprovedOvertimeInfo,
    now: Date,
    attendance: AttendanceRecord | null,
  ): PeriodWindow {
    const start = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`,
    );
    const end = parseISO(`${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`);

    // For overtime, we only care about time interval if not started yet
    const status =
      attendance?.isOvertime && attendance?.CheckInTime
        ? PeriodStatus.ACTIVE
        : isWithinInterval(now, { start, end })
          ? PeriodStatus.ACTIVE
          : PeriodStatus.PENDING;

    return {
      start,
      end,
      type: PeriodType.OVERTIME,
      overtimeId: overtime.id,
      isConnected: false,
      status,
    };
  }

  private getLastCheckIn(attendance: AttendanceRecord) {
    if (!attendance.CheckInTime) return null;
    return {
      time: attendance.CheckInTime,
      periodType: attendance.isOvertime
        ? PeriodType.OVERTIME
        : PeriodType.REGULAR,
      isOvertime: attendance.isOvertime,
    };
  }

  private getLastCheckOut(attendance: AttendanceRecord) {
    if (!attendance.CheckOutTime) return null;
    return {
      time: attendance.CheckOutTime,
      periodType: attendance.isOvertime
        ? PeriodType.OVERTIME
        : PeriodType.REGULAR,
      isOvertime: attendance.isOvertime,
    };
  }

  private getMissingEntries(
    attendance: AttendanceRecord | null,
    periods: PeriodWindow[],
    now: Date,
  ): Array<{
    type: 'check-in' | 'check-out';
    periodType: PeriodType;
    expectedTime: Date;
    overtimeId?: string;
  }> {
    if (!periods.length) return [];

    const missing: Array<{
      type: 'check-in' | 'check-out';
      periodType: PeriodType;
      expectedTime: Date;
      overtimeId?: string;
    }> = [];

    for (const period of periods) {
      if (isAfter(period.start, now)) continue;

      if (!attendance) {
        missing.push({
          type: 'check-in', // Now explicitly using literal type
          periodType: period.type,
          expectedTime: period.start,
          overtimeId: period.overtimeId,
        });
        continue;
      }

      if (!attendance.CheckInTime) {
        missing.push({
          type: 'check-in', // Now explicitly using literal type
          periodType: period.type,
          expectedTime: period.start,
          overtimeId: period.overtimeId,
        });
      } else if (!attendance.CheckOutTime && isAfter(now, period.end)) {
        missing.push({
          type: 'check-out', // Now explicitly using literal type
          periodType: period.type,
          expectedTime: period.end,
          overtimeId: period.overtimeId,
        });
      }
    }

    return missing;
  }

  private getPendingTransitions(
    periods: PeriodWindow[],
    attendance: AttendanceRecord | null,
  ): Array<{
    from: PeriodType;
    to: PeriodType;
    transitionTime: Date;
    isComplete: boolean;
  }> {
    const transitions = [];

    // If no attendance or less than 2 periods, no transitions possible
    if (!attendance || periods.length < 2) {
      return [];
    }

    for (let i = 0; i < periods.length - 1; i++) {
      const current = periods[i];
      const next = periods[i + 1];

      if (current.isConnected) {
        const isComplete = Boolean(
          attendance.overtimeEntries?.find(
            (e) => e.overtimeRequestId === next.overtimeId && e.actualStartTime,
          ),
        );

        transitions.push({
          from: current.type,
          to: next.type,
          transitionTime: current.end,
          isComplete,
        });
      }
    }

    return transitions;
  }
}

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

    const periodWindow = this.createPeriodWindow(currentPeriod);
    const overtimePeriod = overtimeInfo
      ? this.createOvertimePeriodWindow(overtimeInfo, now)
      : null;

    if (attendance) {
      enhancedStatus.lastCheckIn = this.getLastCheckIn(attendance);
      enhancedStatus.lastCheckOut = this.getLastCheckOut(attendance);

      // Fix array filtering with type predicate
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
    }

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

  private createPeriodWindow(period: Period): PeriodWindow {
    const now = getCurrentTime();
    return {
      start: period.startTime,
      end: period.endTime,
      type: period.type,
      overtimeId: period.overtimeId,
      isConnected: period.isConnected || false,
      status: isWithinInterval(now, {
        start: period.startTime,
        end: period.endTime,
      })
        ? PeriodStatus.ACTIVE
        : PeriodStatus.PENDING,
    };
  }

  private createOvertimePeriodWindow(
    overtime: ApprovedOvertimeInfo,
    now: Date,
  ): PeriodWindow {
    return {
      start: parseISO(`${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`),
      end: parseISO(`${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`),
      type: PeriodType.OVERTIME,
      overtimeId: overtime.id,
      isConnected: false,
      status: isWithinInterval(now, {
        start: parseISO(`${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`),
        end: parseISO(`${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`),
      })
        ? PeriodStatus.ACTIVE
        : PeriodStatus.PENDING,
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
    attendance: AttendanceRecord,
    periods: PeriodWindow[],
    now: Date,
  ): Array<{
    type: 'check-in' | 'check-out';
    periodType: PeriodType;
    expectedTime: Date;
    overtimeId?: string;
  }> {
    const missing = [];

    for (const period of periods.filter(Boolean)) {
      if (isAfter(period.start, now)) continue;

      if (!attendance.CheckInTime) {
        missing.push({
          type: 'check-in',
          periodType: period.type,
          expectedTime: period.start,
          overtimeId: period.overtimeId,
        });
      } else if (!attendance.CheckOutTime && isAfter(now, period.end)) {
        missing.push({
          type: 'check-out',
          periodType: period.type,
          expectedTime: period.end,
          overtimeId: period.overtimeId,
        });
      }
    }

    return missing as Array<{
      type: 'check-in' | 'check-out';
      periodType: PeriodType;
      expectedTime: Date;
      overtimeId?: string;
    }>;
  }

  private getPendingTransitions(
    periods: PeriodWindow[],
    attendance: AttendanceRecord,
  ): Array<{
    from: PeriodType;
    to: PeriodType;
    transitionTime: Date;
    isComplete: boolean;
  }> {
    const transitions = [];

    for (let i = 0; i < periods.length - 1; i++) {
      const current = periods[i];
      const next = periods[i + 1];

      if (current.isConnected) {
        const isComplete = Boolean(
          attendance.overtimeEntries.find(
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

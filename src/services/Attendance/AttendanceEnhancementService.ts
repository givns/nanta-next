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
import {
  isAfter,
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
} from 'date-fns';

export class AttendanceEnhancementService {
  async enhanceAttendanceStatus(
    attendance: AttendanceRecord | null,
    currentPeriod: Period | null,
    overtimeInfo?: ApprovedOvertimeInfo | null,
  ): Promise<EnhancedAttendanceStatus> {
    const now = getCurrentTime();
    const enhancedStatus = this.createInitialStatus(currentPeriod);

    if (!currentPeriod) return enhancedStatus;

    // Set lastCheckIn if exists
    if (attendance?.CheckInTime) {
      enhancedStatus.lastCheckIn = {
        time: attendance.CheckInTime,
        periodType: attendance.type,
        isOvertime: attendance.isOvertime,
      };

      // If checked in and in current period, update current period status
      if (
        !attendance.CheckOutTime &&
        isWithinInterval(now, {
          start: currentPeriod.startTime,
          end: currentPeriod.endTime,
        })
      ) {
        enhancedStatus.currentPeriod = {
          ...currentPeriod,
          status: PeriodStatus.ACTIVE,
        };
      }
    }

    // Set lastCheckOut if exists
    if (attendance?.CheckOutTime) {
      enhancedStatus.lastCheckOut = {
        time: attendance.CheckOutTime,
        periodType: attendance.type,
        isOvertime: attendance.isOvertime,
      };
    }

    // Create period windows
    const periodWindow = this.createPeriodWindow(currentPeriod, attendance);
    const overtimePeriod = overtimeInfo
      ? this.createOvertimePeriodWindow(overtimeInfo, now)
      : null;

    const validPeriodWindows = [periodWindow, overtimePeriod].filter(
      (p): p is PeriodWindow => p !== null,
    );

    // Check for overtime transition
    if (overtimeInfo && attendance?.CheckInTime && !attendance.CheckOutTime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
      );

      if (
        isWithinInterval(now, {
          start: subMinutes(overtimeStart, 30),
          end: overtimeStart,
        })
      ) {
        enhancedStatus.pendingTransitions = [
          {
            from: PeriodType.REGULAR,
            to: PeriodType.OVERTIME,
            transitionTime: overtimeStart,
            isComplete: false,
          },
        ];
      }
    }

    enhancedStatus.missingEntries = this.getMissingEntries(
      attendance,
      validPeriodWindows,
      now,
    );

    return enhancedStatus;
  }

  private createPeriodWindow(
    period: Period,
    attendance: AttendanceRecord | null,
  ): PeriodWindow {
    const now = getCurrentTime();

    // Determine status based on check-in and current time
    let status = PeriodStatus.PENDING;
    if (attendance?.CheckInTime && !attendance.CheckOutTime) {
      if (
        isWithinInterval(now, {
          start: period.startTime,
          end: period.endTime,
        })
      ) {
        status = PeriodStatus.ACTIVE;
      }
    } else if (attendance?.CheckOutTime) {
      status = PeriodStatus.COMPLETED;
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
  ): PeriodWindow {
    const start = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`,
    );
    const end = parseISO(`${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`);

    return {
      start,
      end,
      type: PeriodType.OVERTIME,
      overtimeId: overtime.id,
      isConnected: true, // Connected to regular period
      status: PeriodStatus.PENDING,
    };
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

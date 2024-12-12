import {
  AttendanceRecord,
  Period,
  PeriodType,
  EnhancedAttendanceStatus,
  ApprovedOvertimeInfo,
} from '@/types/attendance';
import {
  addMinutes,
  isWithinInterval,
  isAfter,
  isBefore,
  parseISO,
  format,
} from 'date-fns';

interface PeriodEntry {
  type: 'check-in' | 'check-out';
  periodType: PeriodType;
  expectedTime: Date;
  overtimeId?: string;
}

interface PeriodTransition {
  from: PeriodType;
  to: PeriodType;
  transitionTime: Date;
  isCompleted: boolean;
}

export class AttendanceEnhancementService {
  private getExpectedEntries(
    currentTime: Date,
    regularPeriod: Period,
    overtimePeriod: Period | null,
  ): PeriodEntry[] {
    const entries: PeriodEntry[] = [
      {
        type: 'check-in',
        periodType: PeriodType.REGULAR,
        expectedTime: regularPeriod.startTime,
      },
      {
        type: 'check-out',
        periodType: PeriodType.REGULAR,
        expectedTime: regularPeriod.endTime,
      },
    ];

    if (overtimePeriod) {
      entries.push(
        {
          type: 'check-in',
          periodType: PeriodType.OVERTIME,
          expectedTime: overtimePeriod.startTime,
          overtimeId: overtimePeriod.overtimeId,
        },
        {
          type: 'check-out',
          periodType: PeriodType.OVERTIME,
          expectedTime: overtimePeriod.endTime,
          overtimeId: overtimePeriod.overtimeId,
        },
      );
    }

    // Filter out future entries
    return entries.filter((entry) => isBefore(entry.expectedTime, currentTime));
  }

  private getMissingEntries(
    attendance: AttendanceRecord | null,
    expectedEntries: PeriodEntry[],
    currentTime: Date,
  ): PeriodEntry[] {
    if (!attendance) return [];

    const missingEntries: PeriodEntry[] = [];
    let lastCompletedTime: Date | null = null;

    // Check each expected entry in sequence
    for (const entry of expectedEntries) {
      const isEntryComplete = this.isEntryComplete(
        attendance,
        entry,
        lastCompletedTime,
      );

      if (!isEntryComplete && this.isEntryDue(entry, currentTime)) {
        missingEntries.push(entry);
      }

      if (isEntryComplete) {
        lastCompletedTime = this.getEntryTime(attendance, entry);
      }
    }

    return missingEntries;
  }

  private isEntryComplete(
    attendance: AttendanceRecord,
    entry: PeriodEntry,
    lastCompletedTime: Date | null,
  ): boolean {
    // Regular period checks
    if (entry.periodType === PeriodType.REGULAR) {
      if (entry.type === 'check-in') {
        return !!attendance.CheckInTime;
      }
      return !!attendance.CheckOutTime;
    }

    // Overtime period checks
    if (entry.periodType === PeriodType.OVERTIME) {
      const overtimeEntry = attendance.overtimeEntries.find(
        (oe) => oe.overtimeRequestId === entry.overtimeId,
      );

      if (!overtimeEntry) return false;

      if (entry.type === 'check-in') {
        return !!overtimeEntry.actualStartTime;
      }
      return !!overtimeEntry.actualEndTime;
    }

    return false;
  }

  private isEntryDue(entry: PeriodEntry, currentTime: Date): boolean {
    const graceTime = addMinutes(entry.expectedTime, 30); // 30 minutes grace period
    return isBefore(entry.expectedTime, currentTime);
  }

  private getEntryTime(
    attendance: AttendanceRecord,
    entry: PeriodEntry,
  ): Date | null {
    if (entry.periodType === PeriodType.REGULAR) {
      return entry.type === 'check-in'
        ? attendance.CheckInTime
        : attendance.CheckOutTime;
    }

    const overtimeEntry = attendance.overtimeEntries.find(
      (oe) => oe.overtimeRequestId === entry.overtimeId,
    );
    if (!overtimeEntry) return null;

    return entry.type === 'check-in'
      ? overtimeEntry.actualStartTime
      : overtimeEntry.actualEndTime;
  }

  async enhanceAttendanceStatus(
    attendance: AttendanceRecord | null,
    currentPeriod: Period | null,
    overtimeInfo?: ApprovedOvertimeInfo | null,
  ): Promise<EnhancedAttendanceStatus> {
    const now = new Date();
    const enhancedStatus: EnhancedAttendanceStatus = {
      currentPeriod,
      lastCheckIn: null,
      lastCheckOut: null,
      missingEntries: [],
      pendingTransitions: [],
    };

    if (!currentPeriod) return enhancedStatus;

    // Create overtime period if exists
    const overtimePeriod = overtimeInfo
      ? {
          type: PeriodType.OVERTIME,
          startTime: parseISO(
            `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
          ),
          endTime: parseISO(
            `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.endTime}`,
          ),
          overtimeId: overtimeInfo.id,
          isOvertime: true,
          isOvernight: false,
        }
      : null;

    // Get expected entries based on periods
    const expectedEntries = this.getExpectedEntries(
      now,
      currentPeriod,
      overtimePeriod,
    );

    // Get missing entries
    if (attendance) {
      enhancedStatus.missingEntries = this.getMissingEntries(
        attendance,
        expectedEntries,
        now,
      );

      // Set last check-in/out info
      if (attendance.CheckInTime) {
        enhancedStatus.lastCheckIn = {
          time: new Date(attendance.CheckInTime),
          periodType: attendance.isOvertime
            ? PeriodType.OVERTIME
            : PeriodType.REGULAR,
          isOvertime: attendance.isOvertime,
        };
      }

      if (attendance.CheckOutTime) {
        enhancedStatus.lastCheckOut = {
          time: new Date(attendance.CheckOutTime),
          periodType: attendance.isOvertime
            ? PeriodType.OVERTIME
            : PeriodType.REGULAR,
          isOvertime: attendance.isOvertime,
        };
      }

      // Detect pending transitions
      if (
        overtimePeriod &&
        attendance.CheckInTime &&
        !attendance.CheckOutTime &&
        !attendance.isOvertime
      ) {
        const overtimeStart = overtimePeriod.startTime;
        if (
          isWithinInterval(now, {
            start: addMinutes(overtimeStart, -30),
            end: addMinutes(overtimeStart, 30),
          })
        ) {
          enhancedStatus.pendingTransitions.push({
            from: PeriodType.REGULAR,
            to: PeriodType.OVERTIME,
            transitionTime: overtimeStart,
            isCompleted: false,
          });
        }
      }
    }

    return enhancedStatus;
  }
}

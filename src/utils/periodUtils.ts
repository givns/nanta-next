// utils/periodUtils.ts
import {
  OvertimeAttendanceInfo,
  AttendanceStatusInfo,
  CurrentPeriodInfo,
  AttendancePeriodContext,
  PeriodType,
  PeriodStatus,
} from '@/types/attendance';
import {
  parseISO,
  format,
  isWithinInterval,
  isBefore,
  isAfter,
} from 'date-fns';

export const getNextCheckTime = (
  overtimeAttendances: OvertimeAttendanceInfo[],
  currentTime: Date,
): Date | null => {
  const nextOvertime = overtimeAttendances.find((ot) => ot.periodStatus.isNext);

  if (nextOvertime) {
    return parseISO(
      `${format(currentTime, 'yyyy-MM-dd')}T${nextOvertime.overtimeRequest.startTime}`,
    );
  }

  return null;
};

// Helper functions
const isWithinOvertimePeriod = (
  currentTime: string,
  overtime: { startTime: string; endTime: string },
) => {
  const current = parseISO(`2000-01-01T${currentTime}`);
  const start = parseISO(`2000-01-01T${overtime.startTime}`);
  let end = parseISO(`2000-01-01T${overtime.endTime}`);

  // Handle overnight overtime
  if (end < start) {
    return isBefore(current, end) || isAfter(current, start);
  }

  return isWithinInterval(current, { start, end });
};

const getRegularPeriodStatus = (regularAttendance: any): PeriodStatus => {
  if (!regularAttendance.regularCheckInTime) return PeriodStatus.PENDING;
  if (!regularAttendance.regularCheckOutTime) return PeriodStatus.ACTIVE;
  return PeriodStatus.COMPLETED;
};

const getOvertimePeriodStatus = (
  overtime: OvertimeAttendanceInfo,
): PeriodStatus => {
  if (overtime.periodStatus.isComplete) return PeriodStatus.COMPLETED;
  if (overtime.periodStatus.isActive) return PeriodStatus.ACTIVE;
  return PeriodStatus.PENDING;
};

const isRegularComplete = (attendanceStatus: AttendanceStatusInfo): boolean => {
  return !!attendanceStatus.latestAttendance?.CheckOutTime;
};

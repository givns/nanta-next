// utils/periodUtils.ts
import {
  parseISO,
  format,
  isWithinInterval,
  isBefore,
  isAfter,
} from 'date-fns';
import {
  AttendanceStatusInfo,
  OvertimeAttendanceInfo,
  CurrentPeriodInfo,
  AttendancePeriod,
} from '@/types/attendance';

export const determinePeriods = (
  regularAttendance: any,
  overtimeAttendances: OvertimeAttendanceInfo[],
): AttendancePeriod[] => {
  const periods: AttendancePeriod[] = [];

  // Add regular shift period
  if (regularAttendance?.shiftStartTime && regularAttendance?.shiftEndTime) {
    periods.push({
      type: 'regular',
      startTime: format(regularAttendance.shiftStartTime, 'HH:mm'),
      endTime: format(regularAttendance.shiftEndTime, 'HH:mm'),
      status: getRegularPeriodStatus(regularAttendance),
    });
  }

  // Add overtime periods
  overtimeAttendances.forEach((ot) => {
    periods.push({
      type: 'overtime',
      startTime: ot.overtimeRequest.startTime,
      endTime: ot.overtimeRequest.endTime,
      overtimeId: ot.overtimeRequest.id,
      status: getOvertimePeriodStatus(ot),
    });
  });

  // Sort periods by start time
  return periods.sort((a, b) => {
    const timeA = parseISO(`2000-01-01T${a.startTime}`);
    const timeB = parseISO(`2000-01-01T${b.startTime}`);
    return timeA.getTime() - timeB.getTime();
  });
};

export const getCurrentPeriodInfo = (
  attendanceStatus: AttendanceStatusInfo,
  now = new Date(),
): CurrentPeriodInfo | null => {
  const currentTime = format(now, 'HH:mm');

  // Check active overtime first
  const activeOvertime = attendanceStatus.overtimeAttendances.find(
    (ot) => ot.periodStatus.isActive,
  );

  if (activeOvertime) {
    return {
      type: 'overtime',
      overtimeId: activeOvertime.overtimeRequest.id,
      checkInTime: activeOvertime.attendanceTime?.checkInTime ?? '',
      checkOutTime: activeOvertime.attendanceTime?.checkOutTime ?? '',
      isComplete: activeOvertime.periodStatus.isComplete,
    };
  }

  // Default to regular period
  if (attendanceStatus.latestAttendance) {
    return {
      type: 'regular',
      checkInTime: attendanceStatus.latestAttendance.checkInTime ?? '',
      checkOutTime: attendanceStatus.latestAttendance.checkOutTime ?? '',
      isComplete: !!attendanceStatus.latestAttendance.checkOutTime,
    };
  }

  return null;
};

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

const getRegularPeriodStatus = (
  regularAttendance: any,
): 'pending' | 'active' | 'completed' => {
  if (!regularAttendance.regularCheckInTime) return 'pending';
  if (!regularAttendance.regularCheckOutTime) return 'active';
  return 'completed';
};

const getOvertimePeriodStatus = (
  overtime: OvertimeAttendanceInfo,
): 'pending' | 'active' | 'completed' => {
  if (overtime.periodStatus.isComplete) return 'completed';
  if (overtime.periodStatus.isActive) return 'active';
  return 'pending';
};

const isRegularComplete = (attendanceStatus: AttendanceStatusInfo): boolean => {
  return !!attendanceStatus.latestAttendance?.checkOutTime;
};

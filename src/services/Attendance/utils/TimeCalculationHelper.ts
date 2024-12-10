// services/Attendance/utils/TimeCalculationHelper.ts

import {
  addDays,
  addMinutes,
  differenceInMinutes,
  set,
  isAfter,
  parseISO,
  format,
  isWithinInterval,
} from 'date-fns';
import {
  ATTENDANCE_CONSTANTS,
  ApprovedOvertimeInfo,
  ShiftData,
  AttendanceRecord,
} from '../../../types/attendance';

export class TimeCalculationHelper {
  static isOutsideShiftHours(now: Date, shift: ShiftData): boolean {
    if (!shift) return true;

    const shiftStart = this.parseTime(shift.startTime, now);
    let shiftEnd = this.parseTime(shift.endTime, now);

    // Handle overnight shift
    if (shiftEnd < shiftStart) {
      shiftEnd = addDays(shiftEnd, 1);
    }

    return now < shiftStart || now > shiftEnd;
  }

  static calculateOvertimeDuration(
    attendance: AttendanceRecord | null,
    overtime: ApprovedOvertimeInfo | null,
  ): number {
    if (!attendance?.CheckOutTime || !overtime) return 0;

    const checkOut = attendance.CheckOutTime;
    const overtimeStart = parseISO(
      `${format(checkOut, 'yyyy-MM-dd')}T${overtime.startTime}`,
    );
    let overtimeEnd = parseISO(
      `${format(checkOut, 'yyyy-MM-dd')}T${overtime.endTime}`,
    );

    if (overtimeEnd < overtimeStart) {
      overtimeEnd = addDays(overtimeEnd, 1);
    }

    return Math.max(
      0,
      (checkOut.getTime() - overtimeStart.getTime()) / (1000 * 60 * 60),
    );
  }

  static calculateRegularHours(
    checkInTime: Date,
    checkOutTime: Date | null,
    breakMinutes: number = 60,
  ): number {
    if (!checkOutTime) return 0;
    const totalMinutes = differenceInMinutes(checkOutTime, checkInTime);
    return Math.max(0, (totalMinutes - breakMinutes) / 60);
  }

  static calculateBreakMinutes(
    checkInTime: Date,
    checkOutTime: Date,
    breakStart: Date,
    breakEnd: Date,
  ): number {
    if (checkOutTime <= breakStart || checkInTime >= breakEnd) {
      return 0;
    }

    const breakOverlapStart =
      checkInTime > breakStart ? checkInTime : breakStart;
    const breakOverlapEnd = checkOutTime < breakEnd ? checkOutTime : breakEnd;

    return Math.max(0, differenceInMinutes(breakOverlapEnd, breakOverlapStart));
  }

  /** @deprecated Use isOvernightPeriod instead */
  static isOvernightShift(startTime: string, endTime: string): boolean {
    const baseDate = new Date();
    const start = this.parseTime(startTime, baseDate);
    const end = this.parseTime(endTime, baseDate);
    return end <= start;
  }

  static isOvernightPeriod(startTime: Date, endTime: Date): boolean {
    const startHours = startTime.getHours();
    const endHours = endTime.getHours();
    return endHours < startHours || endHours < 4;
  }

  static getCheckoutWindow(shiftEnd: Date) {
    const earlyCheckoutStart = addMinutes(
      shiftEnd,
      -ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
    );
    const regularCheckoutEnd = addMinutes(
      shiftEnd,
      ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
    );
    const veryLateThreshold = addMinutes(
      shiftEnd,
      ATTENDANCE_CONSTANTS.VERY_LATE_THRESHOLD,
    );

    return {
      earlyCheckoutStart,
      regularCheckoutEnd,
      veryLateThreshold,
    };
  }

  static getOvertimeWindow(overtimeStart: Date, overtimeEnd: Date) {
    return {
      earlyCheckInWindow: addMinutes(
        overtimeStart,
        -ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      ),
      lateCheckOutWindow: addMinutes(
        overtimeEnd,
        ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
      ),
    };
  }

  private static parseTime(timeString: string, baseDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    return set(baseDate, { hours, minutes, seconds: 0, milliseconds: 0 });
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

  private isNextOvertimePeriod(
    now: Date,
    overtime: ApprovedOvertimeInfo,
  ): boolean {
    const start = parseISO(overtime.startTime);
    return isAfter(start, now);
  }
}

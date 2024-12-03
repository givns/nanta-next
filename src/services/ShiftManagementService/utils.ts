// services/ShiftManagementService/utils.ts

import { ATTENDANCE_CONSTANTS } from '../../types/attendance/base';
import { ShiftWindows } from '../../types/attendance/shift';
import {
  set,
  parseISO,
  format,
  addDays,
  subMinutes,
  addMinutes,
} from 'date-fns';

export class ShiftTimeUtils {
  static parseShiftTime(timeString: string, date: Date): Date {
    // Handle standard time format (HH:mm)
    if (timeString.match(/^\d{2}:\d{2}$/)) {
      const [hours, minutes] = timeString.split(':').map(Number);
      return set(date, {
        hours,
        minutes,
        seconds: 0,
        milliseconds: 0,
      });
    }

    // Handle ISO string format
    if (timeString.includes('T')) {
      const parsedTime = parseISO(timeString);
      return set(date, {
        hours: parsedTime.getHours(),
        minutes: parsedTime.getMinutes(),
        seconds: 0,
        milliseconds: 0,
      });
    }

    // Handle 24-hour format without colon
    if (timeString.match(/^\d{4}$/)) {
      const hours = parseInt(timeString.slice(0, 2));
      const minutes = parseInt(timeString.slice(2));
      return set(date, {
        hours,
        minutes,
        seconds: 0,
        milliseconds: 0,
      });
    }

    throw new Error(`Invalid time format: ${timeString}`);
  }

  static formatShiftTime(date: Date): string {
    return format(date, 'HH:mm');
  }

  static isOvernightShift(startTime: string, endTime: string): boolean {
    const baseDate = new Date();
    const start = this.parseShiftTime(startTime, baseDate);
    const end = this.parseShiftTime(endTime, baseDate);
    return end <= start;
  }
}

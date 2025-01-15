// services/Attendance/AutoCompletionService.ts (new file)
import { ShiftWindowResponse } from '@/types/attendance';
import { AttendanceRecord } from '@/types/attendance/records';
import { getCurrentTime } from '@/utils/dateUtils';
import { PeriodType } from '@prisma/client';
import {
  addHours,
  format,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';

export interface AutoCompleteEntry {
  type: 'check-in' | 'check-out';
  suggestedTime: Date;
  periodType: PeriodType;
  overtimeId?: string;
}

export interface AutoCompletionStrategy {
  requiresConfirmation: boolean;
  message: string;
  entries: AutoCompleteEntry[];
}

export class AutoCompletionService {
  handleMissingEntries(
    attendance: AttendanceRecord | null,
    currentTime: Date,
    window: ShiftWindowResponse,
  ): AutoCompletionStrategy {
    if (!attendance) {
      return { requiresConfirmation: false, message: '', entries: [] };
    }

    const entries: AutoCompleteEntry[] = [];

    // Case 1: Attempting regular checkout without check-in
    if (
      !attendance.CheckInTime &&
      attendance.type === PeriodType.REGULAR &&
      !attendance.isOvertime
    ) {
      entries.push({
        type: 'check-in',
        suggestedTime: parseISO(
          `${format(currentTime, 'yyyy-MM-dd')}T${window.shift.startTime}`,
        ),
        periodType: PeriodType.REGULAR,
      });
    }

    // Case 2: Early regular check-in with incomplete overtime
    if (
      attendance.type === PeriodType.OVERTIME &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime &&
      window.overtimeInfo
    ) {
      const regularShiftStart = parseISO(
        `${format(currentTime, 'yyyy-MM-dd')}T${window.shift.startTime}`,
      );
      const earlyCheckInWindow = subMinutes(regularShiftStart, 30);

      if (currentTime >= earlyCheckInWindow) {
        entries.push({
          type: 'check-out',
          suggestedTime: parseISO(
            `${format(currentTime, 'yyyy-MM-dd')}T${window.overtimeInfo.endTime}`,
          ),
          periodType: PeriodType.OVERTIME,
          overtimeId: attendance.overtimeId || undefined,
        });
      }
    }

    // Case 3: Attempting overtime check-in without regular checkout
    if (
      attendance.type === PeriodType.REGULAR &&
      attendance.CheckInTime &&
      !attendance.CheckOutTime &&
      window.overtimeInfo
    ) {
      const overtimeStart = parseISO(
        `${format(currentTime, 'yyyy-MM-dd')}T${window.overtimeInfo.startTime}`,
      );
      if (currentTime >= overtimeStart) {
        entries.push({
          type: 'check-out',
          suggestedTime: parseISO(
            `${format(currentTime, 'yyyy-MM-dd')}T${window.shift.endTime}`,
          ),
          periodType: PeriodType.REGULAR,
        });
      }
    }

    // Validate entries
    if (
      !this.validateTimeOrder(entries) ||
      !this.validateSuggestions(entries)
    ) {
      return {
        requiresConfirmation: false,
        message: 'Invalid auto-completion entries',
        entries: [],
      };
    }

    return {
      requiresConfirmation: entries.length > 0,
      message: this.generateEnhancedMessage(entries),
      entries,
    };
  }

  private validateTimeOrder(entries: AutoCompleteEntry[]): boolean {
    if (entries.length <= 1) return true;

    for (let i = 0; i < entries.length - 1; i++) {
      const currentEntry = entries[i];
      const nextEntry = entries[i + 1];
      if (currentEntry.suggestedTime >= nextEntry.suggestedTime) {
        console.error('Invalid time order in auto-completion entries:', {
          current: format(currentEntry.suggestedTime, 'HH:mm'),
          next: format(nextEntry.suggestedTime, 'HH:mm'),
        });
        return false;
      }
    }
    return true;
  }

  private validateSuggestions(entries: AutoCompleteEntry[]): boolean {
    const now = getCurrentTime();
    const today = format(now, 'yyyy-MM-dd');

    return entries.every((entry) => {
      const time = entry.suggestedTime;
      const entryDate = format(time, 'yyyy-MM-dd');

      // Check for future time
      if (time > now) {
        console.error('Future time suggestion detected:', {
          suggested: format(time, 'HH:mm'),
          current: format(now, 'HH:mm'),
        });
        return false;
      }

      // Check same day
      if (entryDate !== today) {
        console.error('Cross-day suggestion detected:', {
          suggested: entryDate,
          current: today,
        });
        return false;
      }

      return true;
    });
  }

  private generateEnhancedMessage(entries: AutoCompleteEntry[]): string {
    if (entries.length === 0) return '';

    const regularEntries = entries.filter(
      (e) => e.periodType === PeriodType.REGULAR,
    );
    const overtimeEntries = entries.filter(
      (e) => e.periodType === PeriodType.OVERTIME,
    );

    const parts: string[] = [];

    if (regularEntries.length > 0) {
      const regularActions = regularEntries.map(
        (e) =>
          `${e.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'} ${format(e.suggestedTime, 'HH:mm')}`,
      );
      parts.push(`กะปกติ ${regularActions.join(' และ ')}`);
    }

    if (overtimeEntries.length > 0) {
      const overtimeActions = overtimeEntries.map(
        (e) =>
          `${e.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'} ${format(e.suggestedTime, 'HH:mm')}`,
      );
      parts.push(`โอที ${overtimeActions.join(' และ ')}`);
    }

    return parts.length > 0
      ? `พบการลงเวลาที่ไม่สมบูรณ์: ${parts.join(' และ ')} ระบบจะทำการลงเวลาย้อนหลังให้อัตโนมัติ`
      : '';
  }
}

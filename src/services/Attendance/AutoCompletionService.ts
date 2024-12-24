// services/Attendance/AutoCompletionService.ts (new file)
import { AttendanceRecord } from '@/types/attendance/records';
import { PeriodType } from '@prisma/client';
import { addHours, isWithinInterval } from 'date-fns';

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
  ): AutoCompletionStrategy {
    if (!attendance) {
      return { requiresConfirmation: false, message: '', entries: [] };
    }

    const entries: AutoCompleteEntry[] = [];

    // If trying to check out but no check-in exists
    if (!attendance.CheckInTime && attendance.shiftStartTime) {
      // Check if it's overtime period
      const isOvertimePeriod = attendance.overtimeEntries.some(
        (entry) =>
          !entry.actualStartTime &&
          isWithinInterval(currentTime, {
            start: new Date(attendance.shiftEndTime!), // Overtime starts after shift
            end: addHours(new Date(attendance.shiftEndTime!), 2), // Approximate, should get from actual overtime request
          }),
      );

      if (isOvertimePeriod) {
        // Need both regular check-in/out and overtime check-in
        entries.push({
          type: 'check-in',
          suggestedTime: new Date(attendance.shiftStartTime),
          periodType: PeriodType.REGULAR,
        });
        entries.push({
          type: 'check-out',
          suggestedTime: new Date(attendance.shiftEndTime!),
          periodType: PeriodType.REGULAR,
        });

        // For overtime, we'll use the first pending overtime entry
        const pendingOT = attendance.overtimeEntries.find(
          (entry) => !entry.actualStartTime,
        );
        if (pendingOT) {
          entries.push({
            type: 'check-in',
            suggestedTime: new Date(attendance.shiftEndTime!), // Overtime starts at shift end
            periodType: PeriodType.OVERTIME,
            overtimeId: pendingOT.overtimeRequestId,
          });
        }
      } else {
        // Just regular check-in needed
        entries.push({
          type: 'check-in',
          suggestedTime: attendance.shiftStartTime,
          periodType: PeriodType.REGULAR,
        });
      }
    }

    // Handle missing regular check-out with overtime
    if (
      !attendance.CheckOutTime &&
      attendance.CheckInTime &&
      attendance.overtimeEntries.length > 0
    ) {
      const pendingOT = attendance.overtimeEntries.find(
        (entry) => !entry.actualStartTime && !entry.actualEndTime,
      );

      if (pendingOT) {
        // Missing both regular check-out and overtime check-in
        entries.push({
          type: 'check-out',
          suggestedTime: new Date(attendance.shiftEndTime!),
          periodType: PeriodType.REGULAR,
        });
        entries.push({
          type: 'check-in',
          suggestedTime: new Date(attendance.shiftEndTime!), // Overtime starts at shift end
          periodType: PeriodType.OVERTIME,
          overtimeId: pendingOT.overtimeRequestId,
        });
      }
    }

    return {
      requiresConfirmation: entries.length > 0,
      message: this.generateEnhancedMessage(entries),
      entries,
    };
  }

  private generateEnhancedMessage(entries: AutoCompleteEntry[]): string {
    if (entries.length === 0) return '';

    const regularEntries = entries.filter(
      (e) => e.periodType === PeriodType.REGULAR,
    );
    const overtimeEntries = entries.filter(
      (e) => e.periodType === PeriodType.OVERTIME,
    );

    let message = 'พบการลงเวลาที่ไม่สมบูรณ์: ';

    if (regularEntries.length > 0) {
      message += 'กะปกติ ';
      message += regularEntries
        .map((e) => (e.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'))
        .join(' และ ');
    }

    if (overtimeEntries.length > 0) {
      message += regularEntries.length > 0 ? ' และ ' : '';
      message += 'โอที ';
      message += overtimeEntries
        .map((e) => (e.type === 'check-in' ? 'เข้างาน' : 'ออกงาน'))
        .join(' และ ');
    }

    message += ' ระบบจะทำการลงเวลาย้อนหลังให้อัตโนมัติ';
    return message;
  }
}

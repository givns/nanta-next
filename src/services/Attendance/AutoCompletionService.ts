// services/Attendance/AutoCompletionService.ts (new file)
import { PeriodType } from '@/types/attendance';
import { AttendanceRecord } from '@/types/attendance/records';

// services/Attendance/AutoCompletionService.ts
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
      return {
        requiresConfirmation: false,
        message: '',
        entries: [],
      };
    }

    const entries: AutoCompleteEntry[] = [];
    const missingCheckIn = !attendance.CheckInTime;
    const missingCheckOut = !attendance.CheckOutTime;

    if (missingCheckIn && attendance.shiftStartTime) {
      entries.push({
        type: 'check-in',
        suggestedTime: attendance.shiftStartTime,
        periodType: attendance.isOvertime
          ? PeriodType.OVERTIME
          : PeriodType.REGULAR,
        overtimeId: attendance.overtimeEntries[0]?.overtimeRequestId,
      });
    }

    if (missingCheckOut && attendance.shiftEndTime) {
      entries.push({
        type: 'check-out',
        suggestedTime: attendance.shiftEndTime,
        periodType: attendance.isOvertime
          ? PeriodType.OVERTIME
          : PeriodType.REGULAR,
        overtimeId: attendance.overtimeEntries[0]?.overtimeRequestId,
      });
    }

    return {
      requiresConfirmation: entries.length > 0,
      message: this.generateMessage(entries),
      entries,
    };
  }

  private generateMessage(entries: AutoCompleteEntry[]): string {
    if (entries.length === 0) return '';

    const types = entries.map((e) =>
      e.type === 'check-in' ? 'เข้างาน' : 'ออกงาน',
    );
    return `พบการลงเวลา${types.join(' และ ')}ที่ไม่สมบูรณ์ ระบบจะทำการลงเวลาย้อนหลังให้อัตโนมัติ`;
  }
}

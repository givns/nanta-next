// services/Attendance/AttendanceEnhancementService.ts
import { TimeEntryService } from '../../TimeEntryService';
import {
  AttendanceRecord,
  Period,
  PeriodType,
  EnhancedAttendanceStatus,
  ApprovedOvertimeInfo,
} from '@/types/attendance';
import { addMinutes, isWithinInterval } from 'date-fns';

export class AttendanceEnhancementService {
  constructor(private timeEntryService: TimeEntryService) {}

  async enhanceAttendanceStatus(
    attendance: AttendanceRecord | null,
    currentPeriod: Period | null,
    overtimeInfo?: ApprovedOvertimeInfo | null,
  ): Promise<EnhancedAttendanceStatus> {
    const enhancedStatus: EnhancedAttendanceStatus = {
      currentPeriod,
      lastCheckIn: null,
      lastCheckOut: null,
      missingEntries: [],
      pendingTransitions: [],
    };

    // Set last check-in/out info
    if (attendance && attendance.CheckInTime) {
      enhancedStatus.lastCheckIn = {
        time: new Date(attendance.CheckInTime),
        periodType: attendance.isOvertime
          ? PeriodType.OVERTIME
          : PeriodType.REGULAR,
        isOvertime: attendance.isOvertime,
      };
    }

    if (attendance && attendance.CheckOutTime) {
      enhancedStatus.lastCheckOut = {
        time: new Date(attendance.CheckOutTime),
        periodType: attendance.isOvertime
          ? PeriodType.OVERTIME
          : PeriodType.REGULAR,
        isOvertime: attendance.isOvertime,
      };
    }

    // Detect missing entries
    if (currentPeriod) {
      if (attendance && !attendance.CheckInTime) {
        enhancedStatus.missingEntries.push({
          type: 'check-in',
          periodType: currentPeriod.type,
          expectedTime: new Date(currentPeriod.startTime),
          overtimeId: overtimeInfo?.id,
        });
      }

      if (attendance && attendance.CheckInTime && !attendance.CheckOutTime) {
        enhancedStatus.missingEntries.push({
          type: 'check-out',
          periodType: currentPeriod.type,
          expectedTime: new Date(currentPeriod.endTime),
          overtimeId: overtimeInfo?.id,
        });
      }

      // Detect pending transitions
      if (
        overtimeInfo &&
        attendance &&
        attendance.CheckInTime &&
        !attendance.CheckOutTime
      ) {
        const overtimeStart = new Date(overtimeInfo.startTime);
        const now = new Date();

        if (
          isWithinInterval(now, {
            start: addMinutes(overtimeStart, -30), // Buffer for transition
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

// services/Attendance/AttendancePeriodService.ts

import {
  ApprovedOvertimeInfo,
  CurrentPeriodInfo,
  PeriodType,
  ShiftData,
} from '@/types/attendance';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { getCurrentTime } from '@/utils/dateUtils';
import { startOfDay, endOfDay, parseISO, format } from 'date-fns';

export class AttendancePeriodService {
  constructor(
    private shiftService: ShiftManagementService,
    private overtimeService: OvertimeServiceServer,
  ) {}

  async getCurrentPeriod(employeeId: string): Promise<CurrentPeriodInfo> {
    const now = getCurrentTime();
    const shiftInfo = await this.shiftService.getEffectiveShift(
      employeeId,
      now,
    );
    const overtimeRequest =
      await this.overtimeService.getCurrentApprovedOvertimeRequest(
        employeeId,
        now,
      );

    if (overtimeRequest) {
      return this.createOvertimePeriod(overtimeRequest, now);
    }

    if (shiftInfo) {
      return this.createRegularPeriod(shiftInfo.current, now);
    }

    return this.createDefaultPeriod(now);
  }

  private createDefaultPeriod(date: Date): CurrentPeriodInfo {
    return {
      type: PeriodType.REGULAR,
      isComplete: false,
      current: {
        start: startOfDay(date),
        end: endOfDay(date),
      },
    };
  }

  private createOvertimePeriod(
    overtime: ApprovedOvertimeInfo,
    date: Date,
  ): CurrentPeriodInfo {
    return {
      type: PeriodType.OVERTIME,
      overtimeId: overtime.id,
      isComplete: false,
      current: {
        start: parseISO(`${format(date, 'yyyy-MM-dd')}T${overtime.startTime}`),
        end: parseISO(`${format(date, 'yyyy-MM-dd')}T${overtime.endTime}`),
      },
    };
  }

  private createRegularPeriod(shift: ShiftData, date: Date): CurrentPeriodInfo {
    const shiftStart = this.shiftService.utils.parseShiftTime(
      shift.startTime,
      date,
    );
    const shiftEnd = this.shiftService.utils.parseShiftTime(
      shift.endTime,
      date,
    );

    return {
      type: PeriodType.REGULAR,
      isComplete: false,
      current: {
        start: shiftStart,
        end: shiftEnd,
      },
    };
  }
}

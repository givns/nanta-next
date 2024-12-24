import { Holiday, PeriodType, Shift } from '@prisma/client';
import { OvertimeContext } from './overtime';
import { HolidayInfo } from './leave';

export interface ShiftData {
  id: string;
  name: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

export interface EffectiveShift {
  current: ShiftData;
  regular: ShiftData;
  isAdjusted: boolean;
  adjustment?: ShiftAdjustment | null;
}

export interface ShiftWindows {
  start: Date;
  end: Date;
  earlyWindow: Date;
  lateWindow: Date;
  overtimeWindow: Date;
}

export interface ShiftContext {
  shift: {
    id: string;
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  };
  schedule: {
    isHoliday: boolean;
    isDayOff: boolean;
    isAdjusted: boolean;
    holidayInfo?: HolidayInfo;
  };
}

export interface TransitionContext {
  nextPeriod?: {
    type: PeriodType;
    startTime: string;
    overtimeInfo?: OvertimeContext;
  } | null;
  transition?: TransitionInfo;
}

export interface TransitionInfo {
  from: {
    type: PeriodType;
    end: string;
  };
  to: {
    type: PeriodType;
    start: string | null;
  };
  isInTransition: boolean;
}

export interface ShiftAdjustment {
  id: string;
  employeeId: string;
  updatedAt: Date;
  requestedShiftId: string;
  date: Date;
  reason: string;
  status: string;
  createdAt: Date;
  requestedShift: {
    id: string;
    name: string;
    shiftCode: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  };
}

export interface ShiftStatus {
  isOutsideShift: boolean;
  isLate: boolean;
  isDayOff: boolean;
  isHoliday: boolean;
  isOvertime: boolean;
}

export interface ShiftAdjustmentInfo {
  date: string;
  requestedShiftId: string;
  requestedShift: ShiftData;
}

export interface FutureShift {
  date: string;
  shift: ShiftData;
}

// Add this interface for getEffectiveShiftAndStatus result
export interface EffectiveShiftResult {
  regularShift: ShiftData;
  effectiveShift: ShiftData;
  shiftstatus: ShiftStatus;
  holidayInfo: HolidayInfo | null;
}

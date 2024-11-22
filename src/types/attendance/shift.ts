import { BaseEntity } from './base';
import { ApprovalStatus } from './status';

export interface ShiftData {
  id: string;
  name: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

export interface ShiftWindows {
  shiftStart: Date;
  shiftEnd: Date;
  earlyWindow: Date;
  lateWindow: Date;
  overtimeWindow: Date;
}

export interface ShiftAdjustment extends BaseEntity {
  requestedShiftId: string;
  requestedShift: ShiftData;
  status: ApprovalStatus;
  reason: string;
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
  shiftstatus: {
    isOutsideShift: boolean;
    isLate: boolean;
    isOvertime: boolean;
    isDayOff: boolean;
    isHoliday: boolean;
  };
}

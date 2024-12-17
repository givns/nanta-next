import { AttendanceState, CheckStatus, OvertimeState } from '@prisma/client';
import { PeriodStatus, PeriodType } from './status';
import { PeriodTransition } from './response';

export interface Period {
  type: PeriodType;
  startTime: Date;
  endTime: Date;
  isOvertime: boolean;
  overtimeId?: string;
  isOvernight: boolean;
  isDayOffOvertime?: boolean;
  isConnected?: boolean; //
}

export interface PeriodWindow {
  start: Date;
  end: Date;
  type: PeriodType;
  overtimeId?: string;
  isConnected: boolean;
  nextPeriod?: {
    type: PeriodType;
    start: Date;
    end: Date;
    overtimeId?: string;
  };
}

export interface PeriodInfo {
  type: PeriodType;
  window: {
    start: string;
    end: string;
  };
  status: PeriodStatus;
  attendance?: PeriodAttendance;
  overtime?: OvertimePeriodInfo;
  transitions: PeriodTransition | null;
}

export interface PeriodAttendance {
  id: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  state: AttendanceState;
  checkStatus: CheckStatus;
}

export interface OvertimePeriodInfo {
  id: string;
  startTime: string;
  endTime: string;
  status: OvertimeState;
}

export interface DailyPeriods {
  date: string;
  periods: PeriodWindow[];
  currentPeriodIndex: number;
  hasCompletedPeriods: boolean;
  hasIncompletePeriods: boolean;
  hasFuturePeriods: boolean;
}

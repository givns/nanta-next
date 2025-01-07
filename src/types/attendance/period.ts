import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { PeriodStatus } from './status';

export interface PeriodWindow {
  start: Date;
  end: Date;
  type: PeriodType;
  overtimeId?: string;
  isConnected: boolean;
  status: PeriodStatus;
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
  status: {
    isComplete: boolean;
    isCurrent: boolean;
    requiresTransition: boolean;
  };
}

export interface PeriodAttendance {
  id: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  state: AttendanceState;
  checkStatus: CheckStatus;
}

export interface PeriodStatusInfo {
  isActiveAttendance: boolean;
  isOvertimePeriod: boolean;
  timingFlags: {
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isVeryLateCheckOut: boolean;
    lateCheckOutMinutes: number;
  };
  shiftTiming: {
    isMorningShift: boolean;
    isAfternoonShift: boolean;
    isAfterMidshift: boolean;
  };
}

export interface TransitionStatusInfo {
  isInTransition: boolean;
  window: {
    start: Date;
    end: Date;
  };
  targetPeriod: PeriodType;
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

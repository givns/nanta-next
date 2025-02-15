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

export interface PeriodDefinition {
  type: PeriodType; // Type of period (Regular/Overtime)
  startTime: string; // Start time as a string (e.g., '03:00')
  endTime: string; // End time as a string (e.g., '04:00')
  sequence: number; // Chronological order of periods
  isDayOff?: boolean; // Optional flag for day-off periods
  isOvernight?: boolean; // Flag to indicate if period crosses midnight
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

export interface TimingFlags {
  isEarlyCheckIn: boolean;
  isLateCheckIn: boolean;
  isEarlyCheckOut: boolean;
  isLateCheckOut: boolean;
  isVeryLateCheckOut: boolean;
  lateCheckOutMinutes: number;
  requiresTransition: boolean;
  requiresAutoCompletion: boolean;
}

export interface PeriodStatusInfo {
  isActiveAttendance: boolean;
  isOvertimePeriod: boolean;
  timingFlags: TimingFlags;
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

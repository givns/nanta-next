// ===================================
// types/attendance/overtime.ts
// Overtime specific types
// ===================================

import { ApprovedOvertimeInfo } from './status';

export interface OvertimeInfo {
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
  startTime: string;
  endTime: string;
}

export interface OvertimeWindows {
  earlyCheckInWindow: Date;
  lateCheckOutWindow: Date;
}

// Add to existing interfaces
export interface OvertimeCheckOutData {
  actualStartTime: Date;
  actualEndTime: Date;
  plannedStartTime: Date;
  plannedEndTime: Date;
  isAutoCheckIn: boolean;
  isLateCheckIn: boolean;
  maxCheckOutTime: Date;
}

export interface ExtendedApprovedOvertime extends ApprovedOvertimeInfo {
  overtimeEntries: OvertimeEntryData[];
}

// Define OvertimeEntry type
export interface OvertimeEntryData {
  id: string;
  attendanceId: string;
  overtimeRequestId: string;
  actualStartTime: Date;
  actualEndTime: Date | null;
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OvertimeContext {
  currentOvertime: ApprovedOvertimeInfo | null;
  futureOvertimes: ApprovedOvertimeInfo[];
  overtimeWindows: {
    earlyCheckInWindow: Date;
    lateCheckOutWindow: Date;
  };
  overtimeMetadata?: {
    isDayOffOvertime: boolean;
    isInsideShiftHours: boolean;
  };
}

export interface OvertimeValidation {
  isWithinAllowedHours: boolean;
  isApproved: boolean;
  isDayOffOvertime: boolean;
  isInsideShiftHours: boolean;
  validationErrors: Array<{
    code: string;
    message: string;
  }>;
}

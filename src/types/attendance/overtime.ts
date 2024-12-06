// ===================================
// types/attendance/overtime.ts
// Overtime specific types
// ===================================

import { ApprovedOvertimeInfo, OvertimeState } from './status';

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
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string;
  validationWindow?: {
    earliestCheckIn: Date;
    latestCheckOut: Date;
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

export class AttendanceError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AttendanceError';
  }

  static ValidationError = (message: string, details?: unknown) =>
    new AttendanceError('VALIDATION_ERROR', message, details);

  static SystemError = (message: string, details?: unknown) =>
    new AttendanceError('SYSTEM_ERROR', message, details);

  static NetworkError = (message: string, details?: unknown) =>
    new AttendanceError('NETWORK_ERROR', message, details);
}

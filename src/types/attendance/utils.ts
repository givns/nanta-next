// types/attendance/utils.ts

import { AttendanceState, PeriodType } from '@prisma/client';
import { OvertimeMetadata } from './records';

export interface TimeEntryWithDate {
  id: string;
  employeeId: string;
  date: Date;
  startTime: Date | null;
  endTime: Date | null;
  regularHours: number;
  overtimeHours: number;
  status: 'in_progress' | 'completed';
  attendanceId: string | null;
  overtimeRequestId: string | null;
  entryType: 'regular' | 'overtime';
  isLate: boolean;
  isDayOff: boolean;
  overtimeMetadata?: OvertimeMetadata;
}

export interface DateRange {
  start: Date;
  end: Date;
  isValid: boolean;
  duration: number;
}

export interface AttendanceFilters {
  dateRange: DateRange;
  employeeIds?: string[];
  departments?: string[];
  currentState: AttendanceState;
  periodTypes?: PeriodType[];
  searchTerm?: string;
}

export interface DateTimeRange {
  startDate: Date;
  endDate: Date;
  startTime?: string;
  endTime?: string;
}

export interface TimePeriod {
  start: Date;
  end: Date;
  duration: number;
  type: PeriodType;
}

export interface TimeWindowResult {
  start: Date;
  end: Date;
  earlyWindow: Date;
  lateWindow: Date;
}

export interface TimeEntryData {
  regularHours: number;
  overtimeHours: number;
}

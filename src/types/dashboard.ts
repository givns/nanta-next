// types/dashboard.ts
import { UserData } from './user';
import {
  AttendanceStatusInfo,
  ProcessedAttendance,
  ShiftData,
} from './attendance';

// For UI display
export interface PayrollPeriodDisplay {
  startDate: Date;
  endDate: Date;
}

export interface DashboardData {
  user: UserData & { assignedShift: ShiftData };
  attendanceStatus: AttendanceStatusInfo | null;
  payrollAttendance: ProcessedAttendance[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
  payrollPeriod: PayrollPeriodDisplay; // Using the UI-specific type
}

// Type guard for API response
export function isDashboardData(data: any): data is DashboardData {
  return (
    data &&
    typeof data === 'object' &&
    'user' in data &&
    'attendanceStatus' in data &&
    'payrollAttendance' in data &&
    'payrollPeriod' in data &&
    typeof data.payrollPeriod === 'object' &&
    'startDate' in data.payrollPeriod &&
    'endDate' in data.payrollPeriod
  );
}

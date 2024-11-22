// types/dashboard.ts
import { ShiftData } from './attendance';
import { ProcessedAttendance } from './attendance/processing';
import { AttendanceStatusInfo } from './attendance/status';
import { UserData } from './user';

// For UI display
export interface PayrollPeriodDisplay {
  startDate: Date;
  endDate: Date;
}

export interface DashboardData {
  user: UserData & { assignedShift: ShiftData };
  attendanceStatus: AttendanceStatusInfo | null;
  effectiveShift: ShiftData | null; // Add this
  payrollAttendance: ProcessedAttendance[];
  totalWorkingDays: number;
  totalPresent: number;
  totalAbsent: number;
  overtimeHours: number;
  balanceLeave: number;
  payrollPeriod: PayrollPeriodDisplay; // Using the UI-specific type
}

// Update the type guard to ensure nested fields are correctly validated.
export function isDashboardData(data: any): data is DashboardData {
  return (
    data &&
    typeof data === 'object' &&
    'user' in data &&
    'attendanceStatus' in data &&
    'effectiveShift' in data &&
    'payrollAttendance' in data &&
    'totalWorkingDays' in data &&
    'totalPresent' in data &&
    'totalAbsent' in data &&
    'overtimeHours' in data &&
    'balanceLeave' in data &&
    'payrollPeriod' in data &&
    typeof data.payrollPeriod === 'object' &&
    'startDate' in data.payrollPeriod &&
    'endDate' in data.payrollPeriod
  );
}

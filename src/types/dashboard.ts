// types/dashboard.ts
import { AttendanceStateResponse, ShiftData, TimeEntry } from './attendance';
import { UserData } from './user';

// For UI display
export interface PayrollPeriodDisplay {
  startDate: Date;
  endDate: Date;
}

export interface DashboardData {
  user: UserData & { assignedShift: ShiftData };
  attendanceStatus: AttendanceStateResponse | null;
  effectiveShift: ShiftData | null; // Add this
  payrollAttendance: TimeEntry[];
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

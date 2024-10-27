import { Payroll, TimeEntryPayrollPeriod } from '@prisma/client';

export interface PayrollCalculation {
  actualBasePayAmount: number;
  overtimeAmount: {
    workday: number;
    weekendShift: number;
    holiday: number;
    total: number;
  };
  allowances: {
    meal: number;
    manager: number;
    other: number;
    total: number;
  };
  deductions: {
    socialSecurity: number;
    other: number;
    total: number;
  };
  grossAmount: number;
  netPayable: number;
}

export interface DailyPayrollRecord {
  id: string;
  employeeId: string;
  date: Date;
  timeEntryId: string;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  holidayOvertimeHours: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  status: 'pending' | 'processed' | 'approved';
  payrollPeriodId?: string;
}

export interface ProcessedTimeEntries {
  workingHours: {
    regularHours: number;
    workdayOvertimeHours: number;
    weekendShiftOvertimeHours: number;
    holidayOvertimeHours: number;
  };
  attendance: {
    presentDays: number;
    unpaidLeaveDays: number;
    paidLeaveDays: number;
    holidayDays: number;
    totalLateMinutes: number;
    earlyDepartures: number;
  };
  leaves: {
    sick: number;
    business: number;
    annual: number;
    unpaid: number;
  };
}

export interface PayrollPeriod {
  id: string;
  startDate: Date;
  endDate: Date;
  status: 'processing' | 'completed' | 'approved';
}

export interface PayrollPeriodDisplay {
  startDate: Date; // It's using startDate instead of start
  endDate: Date; // It's using endDate instead of end
}

export interface PayrollSettings {
  id?: string;
  employeeType: string;
  regularHourlyRate: number;
  overtimeRates: {
    regular: number;
    holiday: number;
  };
  allowances: {
    transportation: number;
    meal: number;
    housing: number;
  };
  deductions: {
    socialSecurity: number;
    tax: number;
  };
  workingHours: {
    regularHoursPerDay: number;
    regularDaysPerWeek: number;
  };
  leaveSettings: {
    sickLeavePerYear: number;
    annualLeavePerYear: number;
    businessLeavePerYear: number;
  };
}

export interface Attendance {
  presentDays: number;
  unpaidLeaveDays: number;
  paidLeaveDays: number;
  holidayDays: number;
  totalLateMinutes?: number;
  earlyDepartures?: number;
}

export interface LeaveData {
  sick: number;
  business: number;
  annual: number;
  unpaid: number;
}

export interface PayrollCalculationResult {
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  baseAmount: number;
  overtimeAmount: number;
  holidayAmount: number;
  totalAllowances: number;
  totalDeductions: number;
  netPayable: number;
}

export interface ProcessingStatus {
  totalEmployees: number;
  processedCount: number;
  status: 'idle' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface PayrollSummaryResponse {
  periodStart: string;
  periodEnd: string;
  employeeName: string;
  departmentName: string;
  totalWorkDays: number;
  holidays: number;
  regularHours: number;
  overtimeHours: number;
  daysPresent: number;
  daysAbsent: number;
  leaves: {
    sick: number;
    business: number;
    annual: number;
    unpaid: number;
  };
  earnings: {
    basePay: number;
    overtimePay: number;
    holidayPay: number;
    allowances: number;
    totalDeductions: number;
    netPayable: number;
    deductions: {
      socialSecurity: number;
      tax: number;
    };
  };
  bankInfo?: {
    bankName: string;
    accountNumber: string;
  };
}

// types/payroll.ts
export interface AdminPayrollData {
  employee: {
    name: string;
    departmentName: string;
    role: string;
  };
  summary: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
  };
  hours: {
    regularHours: number;
    overtimeHours: number;
    holidayHours: number;
  };
  attendance: {
    totalLateMinutes: number;
    earlyDepartures: number;
  };
  leaves: {
    sick: number;
    annual: number;
    business: number;
    holidays: number;
  };
  rates: {
    regularHourlyRate: number;
    overtimeRate: number;
  };
  earnings: {
    baseAmount: number;
    overtimeAmount: number;
  };
  allowances: {
    transportation: number;
    meal: number;
    housing: number;
  };
  deductions: {
    socialSecurity: number;
    tax: number;
  };
  netPayable: number;
}

export type PayrollStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'approved'
  | 'paid';

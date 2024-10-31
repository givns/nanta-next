// types/payroll/index.ts
import { EmployeeType } from '@prisma/client';
import { ProcessedSalesCommission } from '../commissions';

export type PayrollStatus = 'draft' | 'processing' | 'completed' | 'approved' | 'paid';

export interface PayrollEmployee {
  id: string;
  employeeId: string;
  name: string;
  departmentName: string;
  role: string;
  employeeType: EmployeeType;
}

export interface WorkingHours {
  regularHours: number;
  workdayOvertimeHours: number;
  weekendShiftOvertimeHours: number;
  holidayOvertimeHours: number;
}

export interface AttendanceRecord {
  totalLateMinutes: number;
  earlyDepartures: number;
  presentDays: number;
  unpaidLeaveDays: number;
  paidLeaveDays: number;
  holidayDays: number;
}

export interface LeaveRecord {
  sick: number;
  annual: number;
  business: number;
  holidays: number;
  unpaid: number;
}

export interface PayrollRates {
  regularHourlyRate: number;
  overtimeRate: number;
}

export interface PayrollAllowances {
  transportation: number;
  meal: number;
  housing: number;
}

export interface PayrollDeductions {
  socialSecurity: number;
  tax: number;
  unpaidLeave: number;
  total: number;
}

export interface PayrollCalculationResult {
  employee: PayrollEmployee;
  summary: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
  };
  hours: WorkingHours;
  attendance: AttendanceRecord;
  leaves: LeaveRecord;
  rates: PayrollRates;
  commission?: ProcessedSalesCommission;
  processedData: {
    basePay: number;
    overtimePay: number;
    allowances: PayrollAllowances;
    deductions: PayrollDeductions;
    netPayable: number;
  };
}

export interface PayrollSettings {
  overtimeRates: {
    [key in EmployeeType]: {
      workdayOutsideShift: number;
      weekendInsideShiftFulltime: number;
      weekendInsideShiftParttime: number;
      weekendOutsideShift: number;
    };
  };
  allowances: {
    transportation: number;
    meal: {
      [key in EmployeeType]: number;
    };
    housing: number;
  };
  deductions: {
    socialSecurityRate: number;
    socialSecurityMinBase: number;
    socialSecurityMaxBase: number;
  };
  rules: {
    payrollPeriodStart: number;
    payrollPeriodEnd: number;
    overtimeMinimumMinutes: number;
    roundOvertimeTo: number;
  };
}

export interface PayrollProcessingSession {
  periodYearMonth: string;
  status: 'processing' | 'completed' | 'error';
  totalEmployees: number;
  processedCount: number;
  error?: string;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface PayrollProcessingResult {
  employeeId: string;
  periodStart: Date;
  periodEnd: Date;
  processedData: PayrollCalculationResult;
  status: 'completed' | 'error';
  error?: string;
  errorDetails?: {
    message: string;
    stackTrace?: string;
    context?: Record<string, unknown>;
  };
}

export interface PayrollPeriod {
  startDate: Date;
  endDate: Date;
  status: PayrollStatus;
}

export interface PayrollAdjustment {
  type: 'bonus' | 'deduction' | 'correction';
  amount: number;
  reason: string;
  periodStart: Date;
  periodEnd: Date;
}

export interface PayrollSummaryResponse extends PayrollCalculationResult {
  periodStart: string;
  periodEnd: string;
  bankInfo?: {
    bankName: string;
    accountNumber: string;
  };
}
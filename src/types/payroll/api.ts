// types/api.ts
import {
  AttendanceStatusInfo,
  ProcessedAttendance,
  ShiftData,
} from '../attendance';
import { DashboardData } from '../dashboard';
import { UserData } from '../user';
import { EmployeeType } from '@prisma/client';

export interface ApiResponse<T> {
  data: T;
  error?: string;
}

export interface DashboardResponse extends ApiResponse<DashboardData> {}
/**
 * Response type for payroll summary endpoint
 */
export interface PayrollSummaryResponse {
  bankInfo: any;
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
    deductions: any;
    basePay: number;
    overtimePay: number;
    holidayPay: number;
    allowances: number;
    totalDeductions: number;
    netPayable: number;
  };
}

/**
 * Response type for payroll periods endpoint
 */
export interface PayrollPeriodResponse {
  periods: Array<{
    id: string;
    startDate: string;
    endDate: string;
    status: PayrollPeriodStatus;
    isCurrentPeriod: boolean;
  }>;
  currentPeriod: {
    startDate: string;
    endDate: string;
  };
}

/**
 * Response type for payroll settings endpoint
 */
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

/**
 * Payroll calculation details
 */
export interface PayrollCalculation {
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  holidayOvertimeHours: number;
  leaveHours: {
    sick: number;
    business: number;
    annual: number;
    unpaid: number;
  };
  adjustments: PayrollAdjustment[];
}

export interface PayrollCalculationResult {
  regularHours: number;
  overtimeBreakdown: {
    workdayOutside: { hours: number; amount: number };
    weekendInside: { hours: number; amount: number };
    weekendOutside: { hours: number; amount: number };
  };
  allowances: {
    transportation: number;
    meal: number;
    housing: number;
  };
  deductions: {
    socialSecurity: number;
    tax: number;
    unpaidLeave: number;
    total: number;
  };
  netPayable: number;
}

/**
 * Payroll adjustment entry
 */
export interface PayrollAdjustment {
  type: PayrollAdjustmentType;
  amount: number;
  description: string;
  date: string;
}

/**
 * Status of a payroll period
 */
export type PayrollPeriodStatus =
  | 'processing' // Period is currently being processed
  | 'completed' // Processing complete, ready for review
  | 'approved' // Approved for payment
  | 'paid' // Payment has been processed
  | 'error'; // Error occurred during processing

/**
 * Types of payroll adjustments
 */
export type PayrollAdjustmentType =
  | 'bonus'
  | 'deduction'
  | 'allowance'
  | 'correction'
  | 'other';

/**
 * Daily payroll record
 */

export interface DailyPayrollRecord {
  date: string;
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  holidayOvertimeHours: number;
  status: 'pending' | 'processed';
  lateMinutes: number;
  earlyLeaveMinutes: number;
}

export interface PayrollProcessingResult {
  id: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  employee: {
    id: string;
    employeeId: string;
    name: string;
    departmentName: string;
    role: string;
    employeeType: EmployeeType;
  };
  summary: {
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
  };
  hours: {
    regularHours: number;
    workdayOvertimeHours: number;
    weekendShiftOvertimeHours: number;
    holidayOvertimeHours: number;
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
    unpaid: number;
  };
  rates: {
    regularHourlyRate: number;
    overtimeRate: number;
  };
  processedData: {
    basePay: number;
    overtimePay: number;
    allowances: {
      transportation: number;
      meal: number;
      housing: number;
    };
    deductions: {
      socialSecurity: number;
      tax: number;
      unpaidLeave: number;
      total: number;
    };
    netPayable: number;
  };
}
/**
 * Employee payroll summary for dashboard display
 */
export interface EmployeePayrollSummary {
  currentPeriod: {
    start: string;
    end: string;
    daysWorked: number;
    regularHours: number;
    overtimeHours: number;
    estimatedEarnings: number;
  };
  previousPeriod: {
    start: string;
    end: string;
    netPayable: number;
    paymentStatus: 'pending' | 'processed' | 'paid';
    paymentDate?: string;
  };
  yearToDate: {
    totalEarnings: number;
    totalOvertimeHours: number;
    leavesTaken: {
      sick: number;
      annual: number;
      business: number;
      unpaid: number;
    };
  };
}

/**
 * Error response for payroll API endpoints
 */
export interface PayrollErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

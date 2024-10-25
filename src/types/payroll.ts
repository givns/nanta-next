import { Payroll, TimeEntryPayrollPeriod } from '@prisma/client';

export interface PayrollCalculation {
  regularHours: number;
  overtimeHours: number;
  holidayHours: number;
  holidayOvertimeHours: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  leaveHours: {
    sick: number;
    business: number;
    annual: number;
    unpaid: number;
  };
  adjustments: {
    type: 'addition' | 'deduction';
    amount: number;
    reason: string;
  }[];
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

export interface PayrollPeriod {
  id: string;
  startDate: Date;
  endDate: Date;
  status: 'processing' | 'completed' | 'approved';
  timeEntries: TimeEntryPayrollPeriod[];
  payrolls: Payroll[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PayrollPeriodDisplay {
  startDate: Date;
  endDate: Date;
}

export interface PayrollSettings {
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
  leaveSettings: {
    sickLeavePerYear: number;
    annualLeavePerYear: number;
    businessLeavePerYear: number;
  };
  workingHours: {
    regularHoursPerDay: number;
    regularDaysPerWeek: number;
  };
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

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

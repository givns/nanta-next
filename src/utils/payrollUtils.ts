// utils/payrollUtils.ts

import {
  format,
  addMonths,
  subMonths,
  startOfYear,
  endOfMonth,
  parse,
} from 'date-fns';
import {
  PayrollCalculateParams,
  PayrollCalculationResult,
} from '@/types/payroll';
import { EmployeeType } from '@prisma/client';

export interface PeriodRange {
  startDate: Date;
  endDate: Date;
  label: string;
  value: string;
  isCurrentPeriod?: boolean;
}

export class PayrollUtils {
  // Get current payroll period based on settings
  static getCurrentPayrollPeriod(
    currentDate = new Date(),
    periodStartDay = 26,
  ): PeriodRange {
    const day = currentDate.getDate();
    let startDate: Date;
    let endDate: Date;

    if (day < periodStartDay) {
      // Current period is previous month's 26th to current month's 25th
      startDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() - 1,
        periodStartDay,
      );
      endDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        periodStartDay - 1,
      );
    } else {
      // Current period is current month's 26th to next month's 25th
      startDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        periodStartDay,
      );
      endDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        periodStartDay - 1,
      );
    }

    return {
      startDate,
      endDate,
      label: `${format(startDate, 'MMM dd')} - ${format(endDate, 'MMM dd, yyyy')}`,
      value: format(startDate, 'yyyy-MM'),
      isCurrentPeriod: true,
    };
  }

  // Generate list of payroll periods
  static generatePayrollPeriods(
    monthsBack = 12,
    currentDate = new Date(),
    periodStartDay = 26,
  ): PeriodRange[] {
    const periods: PeriodRange[] = [];
    const currentPeriod = this.getCurrentPayrollPeriod(
      currentDate,
      periodStartDay,
    );

    // Add past periods
    for (let i = 0; i < monthsBack; i++) {
      const date = subMonths(currentPeriod.startDate, i);
      const period: PeriodRange = {
        startDate: new Date(
          date.getFullYear(),
          date.getMonth(),
          periodStartDay,
        ),
        endDate: new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          periodStartDay - 1,
        ),
        label: `${format(date, 'MMM dd')} - ${format(addMonths(date, 1), 'MMM dd, yyyy')}`,
        value: format(date, 'yyyy-MM'),
        isCurrentPeriod: i === 0,
      };
      periods.push(period);
    }

    return periods.reverse();
  }

  // Validate payroll calculation result
  static validatePayrollData(data: PayrollCalculationResult): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Required field validation
    if (!data.employee?.id) errors.push('Missing employee ID');
    if (!data.netPayable) errors.push('Missing net payable amount');
    if (!data.regularHours) errors.push('Missing regular hours');

    // Business logic validation
    if (data.netPayable < 0) {
      errors.push('Net payable cannot be negative');
    }

    if (data.totalOvertimeHours > 0 && !data.totalOvertimePay) {
      errors.push('Overtime hours present but no overtime pay calculated');
    }

    // Deductions validation
    const totalDeductions = data.totalDeductions;
    const grossPay = data.basePay + data.totalOvertimePay;
    if (totalDeductions > grossPay) {
      errors.push('Total deductions cannot exceed gross pay');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Format currency for display
  static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2,
    }).format(amount);
  }

  // Format hours for display
  static formatHours(hours: number): string {
    return `${hours.toFixed(1)} hrs`;
  }

  // Helper to parse period value into date range
  static parsePeriodValue(periodValue: string): PeriodRange | null {
    try {
      if (periodValue === 'current') {
        return this.getCurrentPayrollPeriod();
      }

      const date = parse(periodValue, 'yyyy-MM', new Date());
      return {
        startDate: new Date(date.getFullYear(), date.getMonth(), 26),
        endDate: new Date(date.getFullYear(), date.getMonth() + 1, 25),
        label: `${format(date, 'MMM dd')} - ${format(addMonths(date, 1), 'MMM dd, yyyy')}`,
        value: periodValue,
      };
    } catch (error) {
      console.error('Error parsing period value:', error);
      return null;
    }
  }
  static formatAPIRequest(params: PayrollCalculateParams) {
    return new URLSearchParams({
      employeeId: params.employeeId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
    }).toString();
  }

  static formatDateForAPI(date: Date): string {
    return format(date, 'yyyy-MM-dd');
  }

  static validateAPIParams(params: PayrollCalculateParams): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    if (!params.employeeId) errors.push('Employee ID is required');
    if (!params.periodStart) errors.push('Period start is required');
    if (!params.periodEnd) errors.push('Period end is required');

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

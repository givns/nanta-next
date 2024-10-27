// services/PayrollCalculationService.ts

import {
  PayrollRates,
  EmployeeBaseType,
  EmployeeStatus,
  PayrollCalculationInput,
  PayrollCalculationResult,
  WorkingHours,
  Attendance,
} from '../../types/payroll/payroll-calculation';

export class PayrollCalculationService {
  private rates: PayrollRates = {
    socialSecurityRate: 0.05,
    socialSecurityMinBase: 1650,
    socialSecurityMaxBase: 15000,
    workdayOvertimeRate: 1.5,
    weekendShiftOvertimeRate: {
      fulltime: 1.0,
      parttime: 2.0,
    },
    holidayOvertimeRate: 3.0,
    mealAllowancePerDay: 30,
  };

  constructor(rates?: Partial<PayrollRates>) {
    this.rates = { ...this.rates, ...rates };
  }

  calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
    const calculator =
      input.employeeBaseType === 'FULLTIME'
        ? new FulltimePayrollCalculator(this.rates)
        : new ParttimePayrollCalculator(this.rates);

    return calculator.calculate(input);
  }
}

abstract class BasePayrollCalculator {
  constructor(protected rates: PayrollRates) {}

  protected abstract calculateActualBasePayAmount(
    basePayAmount: number,
    attendance: Attendance,
  ): number;

  protected abstract calculateOvertimeAmounts(
    basePayAmount: number,
    workingHours: WorkingHours,
  ): {
    workday: number;
    weekendShift: number;
    holiday: number;
    total: number;
  };

  protected abstract calculateAllowances(
    attendance: Attendance,
    additionalAllowances: { managerAllowance?: number; other?: number },
  ): {
    meal: number;
    manager: number;
    other: number;
    total: number;
  };

  protected calculateSocialSecurityDeduction(amount: number): number {
    if (!amount) return 0;

    const baseAmount = Math.max(
      Math.min(amount, this.rates.socialSecurityMaxBase),
      this.rates.socialSecurityMinBase,
    );

    const deduction = baseAmount * this.rates.socialSecurityRate;
    // Round according to rules: round up if >=.5, round down if <.5
    return Math.round(deduction);
  }

  calculate(input: PayrollCalculationInput): PayrollCalculationResult {
    // 1. Calculate actual base pay
    const actualBasePayAmount = this.calculateActualBasePayAmount(
      input.basePayAmount,
      input.attendance,
    );

    // 2. Calculate overtime amounts
    const overtimeAmount = this.calculateOvertimeAmounts(
      input.basePayAmount,
      input.workingHours,
    );

    // 3. Calculate allowances
    const allowances = this.calculateAllowances(
      input.attendance,
      input.additionalAllowances,
    );

    // 4. Calculate gross amount
    const grossAmount =
      actualBasePayAmount + overtimeAmount.total + allowances.total;

    // 5. Calculate deductions
    const socialSecurity = input.isGovernmentRegistered
      ? this.calculateSocialSecurityDeduction(actualBasePayAmount)
      : 0;

    const deductions = {
      socialSecurity,
      other: 0,
      total: socialSecurity,
    };

    // 6. Calculate net payable
    const netPayable = grossAmount - deductions.total;

    return {
      actualBasePayAmount,
      overtimeAmount,
      allowances,
      deductions,
      grossAmount,
      netPayable,
    };
  }
}

class FulltimePayrollCalculator extends BasePayrollCalculator {
  protected calculateActualBasePayAmount(
    basePayAmount: number,
    attendance: Attendance,
  ): number {
    const dailyRate = basePayAmount / 30;
    const deduction = attendance.unpaidLeaveDays * dailyRate;
    return basePayAmount - deduction;
  }

  protected calculateOvertimeAmounts(
    basePayAmount: number,
    workingHours: WorkingHours,
  ): {
    workday: number;
    weekendShift: number;
    holiday: number;
    total: number;
  } {
    const hourlyRate = basePayAmount / 30 / 8;

    const workday =
      workingHours.workdayOvertimeHours *
      hourlyRate *
      this.rates.workdayOvertimeRate;

    const weekendShift =
      workingHours.weekendShiftOvertimeHours *
      hourlyRate *
      this.rates.weekendShiftOvertimeRate.fulltime;

    const holiday =
      workingHours.holidayOvertimeHours *
      hourlyRate *
      this.rates.holidayOvertimeRate;

    return {
      workday,
      weekendShift,
      holiday,
      total: workday + weekendShift + holiday,
    };
  }

  protected calculateAllowances(
    attendance: Attendance,
    additionalAllowances: { managerAllowance?: number; other?: number },
  ): {
    meal: number;
    manager: number;
    other: number;
    total: number;
  } {
    return {
      meal: 0, // Fulltime doesn't get daily meal allowance
      manager: additionalAllowances.managerAllowance || 0,
      other: additionalAllowances.other || 0,
      total:
        (additionalAllowances.managerAllowance || 0) +
        (additionalAllowances.other || 0),
    };
  }
}

class ParttimePayrollCalculator extends BasePayrollCalculator {
  protected calculateActualBasePayAmount(
    dailyRate: number,
    attendance: Attendance,
  ): number {
    const workingDays =
      attendance.presentDays +
      attendance.paidLeaveDays +
      attendance.holidayDays;
    return dailyRate * workingDays;
  }

  protected calculateOvertimeAmounts(
    basePayAmount: number,
    workingHours: WorkingHours,
  ): {
    workday: number;
    weekendShift: number;
    holiday: number;
    total: number;
  } {
    // For part-time, basePayAmount is already daily rate
    const hourlyRate = basePayAmount / 8;

    const workday =
      workingHours.workdayOvertimeHours *
      hourlyRate *
      this.rates.workdayOvertimeRate;

    const weekendShift =
      workingHours.weekendShiftOvertimeHours *
      hourlyRate *
      this.rates.weekendShiftOvertimeRate.parttime;

    const holiday =
      workingHours.holidayOvertimeHours *
      hourlyRate *
      this.rates.holidayOvertimeRate;

    return {
      workday,
      weekendShift,
      holiday,
      total: workday + weekendShift + holiday,
    };
  }

  protected calculateAllowances(
    attendance: Attendance,
    additionalAllowances: { managerAllowance?: number; other?: number },
  ): {
    meal: number;
    manager: number;
    other: number;
    total: number;
  } {
    const mealAllowance =
      attendance.presentDays * this.rates.mealAllowancePerDay;

    return {
      meal: mealAllowance,
      manager: additionalAllowances.managerAllowance || 0,
      other: additionalAllowances.other || 0,
      total:
        mealAllowance +
        (additionalAllowances.managerAllowance || 0) +
        (additionalAllowances.other || 0),
    };
  }
}

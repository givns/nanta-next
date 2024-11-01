// services/PayrollCalculation/ProbationAdjustmentService.ts

import { PayrollCalculationResult } from '@/types/payroll';
import { EmployeeType } from '@prisma/client';

export class ProbationAdjustmentService {
  // Probation adjustment rates
  private static readonly PROBATION_RATES = {
    BASE_PAY_RATE: 0.8, // 80% of base pay during probation
    OVERTIME_RATE: 0.8, // 80% of overtime pay during probation
    ALLOWANCE_RATE: 0.8, // 80% of allowances during probation
  };

  /**
   * Adjust payroll calculation for probation period
   */
  static adjustForProbation(
    payrollData: PayrollCalculationResult,
  ): PayrollCalculationResult {
    if (payrollData.employee.employeeType !== EmployeeType.Probation) {
      return payrollData;
    }

    // Calculate adjusted overtime pay
    const adjustedOvertimePay =
      payrollData.totalOvertimePay * this.PROBATION_RATES.OVERTIME_RATE;

    // Adjust overtime pay by type
    const adjustedOvertimePayByType = Object.entries(
      payrollData.overtimePayByType,
    ).reduce(
      (acc, [key, value]) => ({
        ...acc,
        [key]: value * this.PROBATION_RATES.OVERTIME_RATE,
      }),
      {} as typeof payrollData.overtimePayByType,
    );

    // Calculate adjusted allowances
    const adjustedAllowances = {
      transportation:
        payrollData.transportationAllowance *
        this.PROBATION_RATES.ALLOWANCE_RATE,
      meal: payrollData.mealAllowance * this.PROBATION_RATES.ALLOWANCE_RATE,
      housing:
        payrollData.housingAllowance * this.PROBATION_RATES.ALLOWANCE_RATE,
    };

    const adjustedTotalAllowances = Object.values(adjustedAllowances).reduce(
      (sum, value) => sum + value,
      0,
    );

    // Calculate adjusted base pay
    const adjustedBasePay =
      payrollData.basePay * this.PROBATION_RATES.BASE_PAY_RATE;

    // Recalculate deductions based on adjusted amounts
    const grossPay =
      adjustedBasePay + adjustedOvertimePay + adjustedTotalAllowances;

    // We might need to adjust deductions based on new gross pay
    const adjustedDeductions = {
      socialSecurity: this.calculateAdjustedSocialSecurity(grossPay),
      tax: this.calculateAdjustedTax(grossPay),
      unpaidLeave: payrollData.unpaidLeaveDeduction, // Keep the same
    };

    const totalDeductions = Object.values(adjustedDeductions).reduce(
      (sum, value) => sum + value,
      0,
    );

    // Create adjusted payroll result
    return {
      ...payrollData,
      basePay: adjustedBasePay,
      overtimePayByType: adjustedOvertimePayByType,
      totalOvertimePay: adjustedOvertimePay,
      transportationAllowance: adjustedAllowances.transportation,
      mealAllowance: adjustedAllowances.meal,
      housingAllowance: adjustedAllowances.housing,
      totalAllowances: adjustedTotalAllowances,
      socialSecurity: adjustedDeductions.socialSecurity,
      tax: adjustedDeductions.tax,
      unpaidLeaveDeduction: adjustedDeductions.unpaidLeave,
      totalDeductions,
      netPayable: grossPay - totalDeductions,
    };
  }

  /**
   * Calculate adjusted social security based on new gross pay
   */
  private static calculateAdjustedSocialSecurity(grossPay: number): number {
    const SOCIAL_SECURITY_RATE = 0.05; // 5%
    const MIN_BASE = 1650;
    const MAX_BASE = 15000;

    const base = Math.min(Math.max(grossPay, MIN_BASE), MAX_BASE);
    return base * SOCIAL_SECURITY_RATE;
  }

  /**
   * Calculate adjusted tax based on new gross pay
   */
  private static calculateAdjustedTax(grossPay: number): number {
    // Simplified tax calculation
    if (grossPay <= 20000) return 0;

    let tax = 0;
    let remainingPay = grossPay;

    if (remainingPay > 20000) {
      const taxableAmount = Math.min(remainingPay - 20000, 10000);
      tax += taxableAmount * 0.05;
      remainingPay -= taxableAmount;
    }

    if (remainingPay > 30000) {
      const taxableAmount = Math.min(remainingPay - 30000, 20000);
      tax += taxableAmount * 0.1;
      remainingPay -= taxableAmount;
    }

    if (remainingPay > 50000) {
      tax += (remainingPay - 50000) * 0.15;
    }

    return tax;
  }
}

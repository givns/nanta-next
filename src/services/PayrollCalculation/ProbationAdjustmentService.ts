// services/ProbationAdjustmentService.ts
import { PayrollCalculationResult } from '@/types/payroll';

interface ProbationRules {
  basePayAdjustmentRate: number; // e.g., 0.9 for 90% of regular salary
  overtimeEligible: boolean;
  allowancesEligible: boolean;
}

export class ProbationAdjustmentService {
  private rules: ProbationRules = {
    basePayAdjustmentRate: 1, // Default no adjustment
    overtimeEligible: true,
    allowancesEligible: true,
  };

  constructor(rules?: Partial<ProbationRules>) {
    this.rules = { ...this.rules, ...rules };
  }

  adjustPayrollCalculation(
    result: PayrollCalculationResult,
  ): PayrollCalculationResult {
    if (!this.rules.overtimeEligible) {
      result.overtimeAmount = {
        workday: 0,
        weekendShift: 0,
        holiday: 0,
        total: 0,
      };
    }

    if (!this.rules.allowancesEligible) {
      result.allowances = {
        meal: 0,
        manager: 0,
        other: 0,
        total: 0,
      };
    }

    // Adjust base pay
    result.actualBasePayAmount *= this.rules.basePayAdjustmentRate;

    // Recalculate gross and net
    result.grossAmount =
      result.actualBasePayAmount +
      result.overtimeAmount.total +
      result.allowances.total;

    result.netPayable = result.grossAmount - result.deductions.total;

    return result;
  }
}

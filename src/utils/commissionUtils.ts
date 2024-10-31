// utils/commissionUtils.ts
import { CommissionTier, CommissionBonus } from '@prisma/client';

interface SalesHistory {
  month: string; // YYYY-MM format
  amount: number;
}

export class CommissionUtils {
  static calculateCommission(
    salesAmount: number,
    tiers: CommissionTier[],
  ): number {
    // Sort tiers by minAmount to ensure proper calculation
    const sortedTiers = [...tiers].sort((a, b) => a.minAmount - b.minAmount);

    for (const tier of sortedTiers) {
      if (
        salesAmount >= tier.minAmount &&
        (!tier.maxAmount || salesAmount < tier.maxAmount)
      ) {
        return salesAmount * (tier.percentage / 100);
      }
    }

    return 0;
  }

  static calculateQuarterlyBonus(
    salesHistory: SalesHistory[],
    bonus: CommissionBonus,
  ): number {
    // Check last 3 months for quarterly bonus
    if (salesHistory.length < 3) return 0;

    const consecutiveMonths = salesHistory
      .slice(-3)
      .every((month) => month.amount >= bonus.targetAmount);

    return consecutiveMonths ? bonus.bonusAmount : 0;
  }

  static calculateYearlyBonus(
    salesHistory: SalesHistory[],
    bonus: CommissionBonus,
  ): number {
    // Count months with sales >= target amount
    const qualifyingMonths = salesHistory.filter(
      (month) => month.amount >= bonus.targetAmount,
    ).length;

    return qualifyingMonths >= bonus.requiredMonths ? bonus.bonusAmount : 0;
  }

  static async calculateTotalCompensation(
    baseSalary: number,
    salesAmount: number,
    salesHistory: SalesHistory[],
    tiers: CommissionTier[],
    quarterlyBonus: CommissionBonus,
    yearlyBonus: CommissionBonus,
  ): Promise<{
    baseSalary: number;
    commission: number;
    quarterlyBonus: number;
    yearlyBonus: number;
    total: number;
  }> {
    const commission = this.calculateCommission(salesAmount, tiers);
    const qBonus = this.calculateQuarterlyBonus(salesHistory, quarterlyBonus);
    const yBonus = this.calculateYearlyBonus(salesHistory, yearlyBonus);

    return {
      baseSalary,
      commission,
      quarterlyBonus: qBonus,
      yearlyBonus: yBonus,
      total: baseSalary + commission + qBonus + yBonus,
    };
  }
}

// types/commissions.ts
export type CommissionStatus = 'calculated' | 'approved' | 'paid';

export interface CommissionTier {
  minAmount: number;
  maxAmount?: number;
  percentage: number;
}

export interface CommissionBonus {
  type: 'quarterly' | 'yearly';
  targetAmount: number;
  requiredMonths: number;
  bonusAmount: number;
}

export interface SalesCommissionCalculation {
  salesAmount: number;
  commissionRate: number;
  commissionAmount: number;
  quarterlyBonus?: number;
  yearlyBonus?: number;
}

export interface ProcessedSalesCommission extends SalesCommissionCalculation {
  status: CommissionStatus;
  periodStart: Date;
  periodEnd: Date;
}
// types/commissions.ts

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
export const PAYROLL_CONSTANTS = {
  SOCIAL_SECURITY: {
    RATE: 0.05, // 5%
    MAX_AMOUNT: 750, // Maximum contribution
  },

  TAX_BRACKETS: [
    { min: 0, max: 150000, rate: 0 },
    { min: 150001, max: 300000, rate: 0.05 },
    { min: 300001, max: 500000, rate: 0.1 },
    { min: 500001, max: 750000, rate: 0.15 },
    { min: 750001, max: 1000000, rate: 0.2 },
    { min: 1000001, max: 2000000, rate: 0.25 },
    { min: 2000001, max: 5000000, rate: 0.3 },
    { min: 5000001, max: Infinity, rate: 0.35 },
  ],

  ALLOWANCES: {
    TRANSPORT: {
      FULL_TIME: 1000,
      PART_TIME: 0,
    },
    MEAL: {
      FULL_TIME: 1000,
      PART_TIME: 0,
    },
    HOUSING: {
      FULL_TIME: 1000,
      PART_TIME: 0,
    },
  },

  RATES: {
    OVERTIME: {
      REGULAR: 1.5,
      HOLIDAY: 2.0,
    },
    LATE_DEDUCTION: {
      MINUTES_THRESHOLD: 30,
      RATE: 1 / 480, // Deduct 1/480 of daily wage per minute
    },
  },

  LEAVE: {
    SICK: {
      ANNUAL_ALLOWANCE: 30,
      PAID_RATE: 1.0,
    },
    ANNUAL: {
      ANNUAL_ALLOWANCE: 6,
      PAID_RATE: 1.0,
    },
    BUSINESS: {
      ANNUAL_ALLOWANCE: 3,
      PAID_RATE: 1.0,
    },
  },

  WORKING_HOURS: {
    REGULAR_HOURS_PER_DAY: 8,
    REGULAR_DAYS_PER_WEEK: 6,
  },
};

export const calculateTax = (annualIncome: number): number => {
  let tax = 0;
  let remainingIncome = annualIncome;

  for (const bracket of PAYROLL_CONSTANTS.TAX_BRACKETS) {
    if (remainingIncome <= 0) break;

    const taxableAmount = Math.min(
      remainingIncome,
      bracket.max - (bracket.min - 1),
    );
    tax += taxableAmount * bracket.rate;
    remainingIncome -= taxableAmount;
  }

  return tax;
};

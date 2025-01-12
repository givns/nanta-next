// Types/interfaces.ts

import { PeriodType } from '@prisma/client';

// Validation action constants
export const VALIDATION_ACTIONS = {
  ACTIVE_SESSION: 'ACTIVE_SESSION',
  TRANSITION_REQUIRED: 'TRANSITION_REQUIRED',
  WAIT_FOR_OVERTIME: 'WAIT_FOR_OVERTIME',
  AUTO_COMPLETE_OVERTIME: 'AUTO_COMPLETE_OVERTIME',
  REGULAR_CHECKIN: 'REGULAR_CHECKIN',
  REGULAR_CHECKOUT: 'REGULAR_CHECKOUT',
} as const;

export const VALIDATION_THRESHOLDS = {
  EARLY_CHECKIN: 30,
  LATE_CHECKIN: 15,
  OVERTIME_CHECKOUT: 15,
  TRANSITION_WINDOW: 15,
} as const;

// Create type for validation actions
export type ValidationAction =
  (typeof VALIDATION_ACTIONS)[keyof typeof VALIDATION_ACTIONS];

// Update ValidationMetadata to use ValidationAction
export interface ValidationMetadata {
  nextTransitionTime?: string;
  requiredAction?: ValidationAction; // Now using the union type
  additionalInfo?: Record<string, unknown>;
  missingEntries?: any[];
  transitionWindow?: {
    start: string;
    end: string;
    targetPeriod: PeriodType;
  };
}

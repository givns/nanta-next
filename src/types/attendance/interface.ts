// Types/interfaces.ts

import { PeriodType } from '@prisma/client';

// Validation action constants
export const VALIDATION_ACTIONS = {
  ACTIVE_SESSION: 'ACTIVE_SESSION',
  TRANSITION_REQUIRED: 'TRANSITION_REQUIRED',
  WAIT_FOR_OVERTIME: 'WAIT_FOR_OVERTIME',
  OVERTIME_CHECKIN: 'OVERTIME_CHECKIN',
  AUTO_COMPLETE_OVERTIME: 'AUTO_COMPLETE_OVERTIME',
  REGULAR_CHECKIN: 'REGULAR_CHECKIN',
  REGULAR_CHECKOUT: 'REGULAR_CHECKOUT',
  AUTO_COMPLETE: 'AUTO_COMPLETE',
  WAIT_FOR_PERIOD: 'WAIT_FOR_PERIOD',
} as const;

export const VALIDATION_THRESHOLDS = {
  EARLY_CHECKIN: 30,
  OT_EARLY_CHECKIN: 10,
  EARLY_CHECKOUT: 5, // Add this for regular periods
  LATE_CHECKIN: 15,
  LATE_CHECKOUT: 15, // 15 minutes after shift end
  VERY_LATE_CHECKOUT: 60, // 1 hour after shift end
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

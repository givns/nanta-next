import { PeriodType } from './status';

export interface Period {
  type: PeriodType;
  startTime: Date;
  endTime: Date;
  isOvertime: boolean;
  overtimeId?: string;
  isOvernight: boolean;
  isDayOffOvertime?: boolean;
}

export interface PeriodTransition {
  from: Period;
  to: Period;
  transitionTime: Date;
  allowEarlyTransition: boolean;
  earlyWindowMinutes: number;
}

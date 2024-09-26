// types/errors.ts

export enum ErrorCode {
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  SHIFT_NOT_FOUND = 'SHIFT_NOT_FOUND',
  OUTSIDE_PREMISES = 'OUTSIDE_PREMISES',
  OUTSIDE_SHIFT_TIME = 'OUTSIDE_SHIFT_TIME',
  ON_LEAVE = 'ON_LEAVE',
  HOLIDAY = 'HOLIDAY',
  EARLY_CHECK_IN = 'EARLY_CHECK_IN',
  LATE_CHECK_IN = 'LATE_CHECK_IN',
  OVERTIME = 'OVERTIME',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppErrorDetails {
  code: ErrorCode;
  message: string;
  details?: any;
}

export class AppError extends Error {
  constructor(public details: AppErrorDetails) {
    super(details.message);
    this.name = 'AppError';
  }
}

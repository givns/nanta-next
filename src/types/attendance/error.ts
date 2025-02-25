// types/attendance/error.ts

// Error code enum
export enum ErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  SHIFT_NOT_FOUND = 'SHIFT_NOT_FOUND',
  OUTSIDE_PREMISES = 'OUTSIDE_PREMISES',
  OUTSIDE_SHIFT_TIME = 'OUTSIDE_SHIFT_TIME',
  ON_LEAVE = 'ON_LEAVE',
  HOLIDAY = 'HOLIDAY',
  OVERTIME = 'OVERTIME',
  NETWORK_ERROR = 'NETWORK_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  INVALID_ATTENDANCE = 'INVALID_ATTENDANCE',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  ATTENDANCE_ERROR = 'ATTENDANCE_ERROR',
  LOCATION_ERROR = 'LOCATION_ERROR',
  SHIFT_DATA_ERROR = 'SHIFT_DATA_ERROR',
  DATA_FETCH_ERROR = 'DATA_FETCH_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  MULTIPLE_ACTIVE_RECORDS = 'MULTIPLE_ACTIVE_RECORDS',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_ID_FORMAT = 'INVALID_ID_FORMAT',
  SERVICE_INITIALIZATION_ERROR = 'SERVICE_INITIALIZATION_ERROR',
  INVALID_STATE_TRANSITION = 'INVALID_STATE_TRANSITION',
}

export interface AppErrorParams {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  originalError?: unknown;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly originalError?: unknown;

  constructor(params: AppErrorParams) {
    super(params.message);
    this.code = params.code;
    this.details = params.details;
    this.originalError = params.originalError;
    this.name = 'AppError';

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

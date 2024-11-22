// ===================================
// types/attendance/transaction.ts
// Transaction handling types
// ===================================

import { ValidationContext } from './context';
import { AppError } from './error';
import { AttendanceRecord, OvertimeEntry, TimeEntry } from './records';

export interface AttendanceTransaction {
  id: string;
  employeeId: string;
  type: 'check-in' | 'check-out';
  timestamp: Date;
  data: {
    location?: Location;
    address?: string;
    photo?: string;
    reason?: string;
    isOvertime?: boolean;
  };
  status: 'pending' | 'processing' | 'completed' | 'failed';
  attempts: number;
  error?: AppError;
  metadata: {
    version: number;
    processedAt?: Date;
    retryCount: number;
  };
}
export interface TransactionContext {
  id: string;
  type: 'check-in' | 'check-out' | 'adjustment' | 'correction';
  employeeId: string;
  timestamp: Date;

  // Processing state
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
  lastAttempt?: Date;

  // Data
  attendance: AttendanceRecord;
  validation: ValidationContext;
  metadata: Record<string, unknown>;

  // Error handling
  error?: TransactionError;
}

export interface TransactionResult {
  success: boolean;
  transactionId: string;
  status: 'completed' | 'failed' | 'partial';

  // Results
  attendance?: AttendanceRecord;
  timeEntries?: TimeEntry[];
  overtimeEntries?: OvertimeEntry[];

  // Processing metadata
  processingTime: number;
  retryCount: number;
  warnings: Array<{
    code: string;
    message: string;
  }>;

  error?: TransactionError;
}

export interface TransactionError {
  code: string;
  message: string;
  details?: Record<string, unknown>;

  // Error context
  timestamp: Date;
  transactionId: string;
  employeeId: string;

  // Error handling
  isRetryable: boolean;
  retryCount: number;
  lastRetryAt?: Date;

  // Stack trace (development only)
  stack?: string;

  // Original error if wrapped
  originalError?: unknown;
}

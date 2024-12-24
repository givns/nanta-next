import { PeriodType } from '@prisma/client';
import { DailyRecord } from './common';

// types/attendance/manual.ts
export interface ManualEntryRequest {
  employeeId: string;
  date: string;
  periodType: PeriodType;
  checkInTime?: string;
  checkOutTime?: string;
  overtimeRequestId?: string; // Added for overtime entries
  overtimeStartTime?: string; // Added for overtime entries
  overtimeEndTime?: string; // Added for overtime entries
}

export interface ManualEntryResponse {
  success: boolean;
  attendance: DailyRecord;
  message: string;
  data?: any;
}

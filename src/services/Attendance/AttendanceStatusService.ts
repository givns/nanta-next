//AttendanceStatusService.ts
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { ErrorCode, AppError } from '../../types/errors';
import { getCurrentTime } from '../../utils/dateUtils';
import {
  AttendanceRecord,
  AttendanceStateResponse,
  AttendanceStatusResponse,
} from '../../types/attendance';
import { CacheManager } from '../cache/CacheManager';
import { AttendanceEnhancementService } from '../Attendance/AttendanceEnhancementService'; // Add this line
import { AttendanceRecordService } from './AttendanceRecordService';
import { cacheService } from '../cache/CacheService';
import { format } from 'date-fns';
import { PeriodType } from '@prisma/client';
import { AttendanceMappers } from './utils/AttendanceMappers';

interface GetAttendanceStatusOptions {
  inPremises: boolean;
  address: string;
  periodType?: PeriodType;
}

export class AttendanceStatusService {
  constructor(
    private readonly shiftService: ShiftManagementService,
    private readonly enhancementService: AttendanceEnhancementService,
    private readonly attendanceRecordService: AttendanceRecordService, // Add this
    private readonly cacheManager: CacheManager,
  ) {}

  async getAttendanceStatus(
    employeeId: string,
    options: GetAttendanceStatusOptions,
  ): Promise<AttendanceStatusResponse> {
    const now = getCurrentTime();
    const forceRefreshKey = `forceRefresh:${employeeId}`;
    const cacheKey = `attendance:${employeeId}:${format(now, 'yyyy-MM-dd:HH:mm')}`;
    const forceRefresh = await cacheService.get(forceRefreshKey);

    // If force refresh flag exists, bypass cache
    if (!forceRefresh) {
      const cachedStatus =
        await this.cacheManager.getAttendanceState(employeeId);
      if (cachedStatus) {
        return cachedStatus;
      }
    }

    // Get all records for the day first
    const [allRecords, periodState] = await Promise.all([
      this.attendanceRecordService.getAllAttendanceRecords(employeeId),
      this.shiftService.getCurrentPeriodState(employeeId, now),
    ]);

    // Find active record first (prioritize overtime)
    const activeRecord =
      allRecords.find(
        (record) =>
          record.CheckInTime &&
          !record.CheckOutTime &&
          record.type === PeriodType.OVERTIME,
      ) ||
      allRecords.find((record) => record.CheckInTime && !record.CheckOutTime);

    if (!periodState) {
      throw new AppError({
        code: ErrorCode.SHIFT_DATA_ERROR,
        message: 'Shift configuration not found',
      });
    }

    // Get latest record and serialize it
    const latestRecord = activeRecord || allRecords[0] || null;
    const serializedLatest = latestRecord
      ? AttendanceMappers.toSerializedAttendanceRecord(latestRecord)
      : null;

    // Serialize all records
    const serializedRecords = allRecords.map((record) =>
      AttendanceMappers.toSerializedAttendanceRecord(record),
    );

    // Build response through enhancement service with serialized record
    const enhancedStatus =
      await this.enhancementService.enhanceAttendanceStatus(
        serializedLatest,
        periodState,
        now,
      );

    // Add all records to base
    enhancedStatus.base.latestAttendance = serializedLatest;
    enhancedStatus.base.additionalRecords = serializedRecords;
    enhancedStatus.base.validation = {
      canCheckIn: enhancedStatus.validation.allowed,
      canCheckOut: enhancedStatus.validation.allowed,
      message: enhancedStatus.validation.reason || '',
    };

    // Cache the result
    await cacheService.del(forceRefreshKey);
    await this.cacheManager.cacheAttendanceState(employeeId, enhancedStatus);

    return enhancedStatus;
  }

  async getLatestAttendanceRecord(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    return this.attendanceRecordService.getLatestAttendanceRecord(employeeId);
  }

  /** @deprecated Use getAttendanceStatus instead */
  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStateResponse> {
    // Keep for backward compatibility
    throw new Error('Deprecated: Use getAttendanceStatus instead');
  }

  /** @deprecated Use getAttendanceStatus instead */
  async createInitialAttendanceStatus(
    userId: string,
    preparedUser: any,
  ): Promise<AttendanceStateResponse> {
    // Keep for backward compatibility
    throw new Error('Deprecated: Use getAttendanceStatus instead');
  }

  /** @deprecated Will be removed in next version */
  async checkMissingAttendance(): Promise<void> {
    // Keep for backward compatibility
    throw new Error('Deprecated: Will be removed in next version');
  }
}

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
      // Try cache first
      const cachedStatus =
        await this.cacheManager.getAttendanceState(employeeId);
      if (cachedStatus) {
        return cachedStatus;
      }
    }

    // Get base data
    const [attendance, periodState] = await Promise.all([
      this.attendanceRecordService.getLatestAttendanceRecord(employeeId, {
        periodType: options.periodType,
      }),
      this.shiftService.getCurrentPeriodState(employeeId, now),
    ]);

    if (!periodState) {
      throw new AppError({
        code: ErrorCode.SHIFT_DATA_ERROR,
        message: 'Shift configuration not found',
      });
    }

    // Build response through enhancement service
    const enhancedStatus =
      await this.enhancementService.enhanceAttendanceStatus(
        attendance,
        periodState,
        now,
      );

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

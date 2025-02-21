//AttendanceStatusService.ts
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { getCurrentTime } from '../../utils/dateUtils';
import {
  AttendanceRecord,
  AttendanceStateResponse,
  AttendanceStatusResponse,
  ShiftWindowResponse,
  ValidationContext,
} from '../../types/attendance';
import { CacheManager } from '../cache/CacheManager';
import { AttendanceEnhancementService } from '../Attendance/AttendanceEnhancementService'; // Add this line
import { AttendanceRecordService } from './AttendanceRecordService';
import { cacheService } from '../cache/CacheService';
import { PeriodType } from '@prisma/client';
import { AttendanceMappers } from './utils/AttendanceMappers';
import { PeriodManagementService } from './PeriodManagementService';
import { format, startOfDay } from 'date-fns';
import { AttendanceStateManager } from './AttendanceStateManager';

interface GetAttendanceStatusOptions {
  inPremises: boolean;
  address: string;
  periodType?: PeriodType;
}

export class AttendanceStatusService {
  private readonly stateManager: AttendanceStateManager;
  constructor(
    private readonly shiftService: ShiftManagementService,
    private readonly enhancementService: AttendanceEnhancementService,
    private readonly attendanceRecordService: AttendanceRecordService,
    private readonly cacheManager: CacheManager,
    private readonly periodManager: PeriodManagementService,
  ) {
    this.stateManager = AttendanceStateManager.getInstance();
  }

  async getAttendanceStatus(
    employeeId: string,
    options: GetAttendanceStatusOptions,
  ): Promise<AttendanceStatusResponse> {
    const now = getCurrentTime();
    const forceRefreshKey = `forceRefresh:${employeeId}`;
    const forceRefresh = await cacheService.get(forceRefreshKey);

    // If force refresh flag exists, bypass cache
    if (!forceRefresh) {
      const cachedStatus =
        await this.cacheManager.getAttendanceState(employeeId);
      if (cachedStatus) {
        return cachedStatus;
      }
    }

    // Get effective shift first
    const shiftData = await this.shiftService.getEffectiveShift(
      employeeId,
      now,
    );
    if (!shiftData) {
      throw new Error('No shift configuration found');
    }

    // Get all attendance records and ensure it's not null
    const allRecords =
      (await this.attendanceRecordService.getAllAttendanceRecords(
        employeeId,
      )) || [];

    // Find active record (prioritize overtime)
    const activeRecord =
      allRecords.find(
        (record) =>
          record.CheckInTime &&
          !record.CheckOutTime &&
          record.type === PeriodType.OVERTIME,
      ) ||
      allRecords.find((record) => record.CheckInTime && !record.CheckOutTime);

    // Log the current state before getting period state
    console.log('Current state before period resolution:', {
      activeRecord: activeRecord
        ? {
            type: activeRecord.type,
            checkIn: activeRecord.CheckInTime,
            checkOut: activeRecord.CheckOutTime,
          }
        : null,
      hasAllRecords: allRecords.length > 0,
    });

    const stateTracker = {
      originalState: null as ShiftWindowResponse | null,
      stateUpdates: [] as Array<{
        timestamp: string;
        hasOvertimeInfo: boolean;
        type: 'initial' | 'enhancement' | 'final';
      }>,
    };

    // Get period state from period manager
    const periodState = await this.periodManager.getCurrentPeriodState(
      employeeId,
      allRecords,
      now,
    );

    console.log('Period state after resolution:', {
      type: periodState.current.type,
      hasOvertime: !!periodState.overtime,
      overtimeDetails: periodState.overtime
        ? {
            id: periodState.overtime.id,
            startTime: periodState.overtime.startTime,
            endTime: periodState.overtime.endTime,
          }
        : null,
    });

    // Transform period state to window response
    // Create window response with tracking
    const windowResponse: ShiftWindowResponse = {
      current: {
        start: periodState.current.timeWindow.start,
        end: periodState.current.timeWindow.end,
      },
      type: periodState.current.type,
      shift: shiftData.current,
      isHoliday: false,
      isDayOff: !shiftData.current.workDays.includes(now.getDay()),
      isAdjusted: shiftData.isAdjusted,
      overtimeInfo: periodState.overtime,
    };

    // Track initial state
    stateTracker.originalState = { ...windowResponse };
    stateTracker.stateUpdates.push({
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
      hasOvertimeInfo: !!windowResponse.overtimeInfo,
      type: 'initial',
    });

    // Get latest record and serialize it
    // Get latest record and serialize it
    const latestRecord = (() => {
      // First priority: Active records (already handles overnight periods)
      if (activeRecord) return activeRecord;

      // Second priority: Today's records
      const todayRecords = allRecords.filter(
        (record) =>
          startOfDay(record.date).getTime() === startOfDay(now).getTime(),
      );
      if (todayRecords.length > 0) return todayRecords[0];

      // No relevant records
      return null;
    })();

    const serializedLatest = latestRecord
      ? AttendanceMappers.toSerializedAttendanceRecord(latestRecord)
      : null;

    // Serialize all records
    const serializedRecords = allRecords.map((record) =>
      AttendanceMappers.toSerializedAttendanceRecord(record),
    );

    // Create validation context
    const validationContext: ValidationContext = {
      employeeId,
      timestamp: now,
      isCheckIn:
        !activeRecord?.CheckInTime || Boolean(activeRecord?.CheckOutTime),
      state: activeRecord?.state,
      checkStatus: activeRecord?.checkStatus,
      overtimeState: activeRecord?.overtimeState,
      attendance: activeRecord || undefined,
      shift: shiftData.current,
      periodType: periodState.current.type,
      isOvertime: periodState.current.type === PeriodType.OVERTIME,
    };

    // Get enhanced status with proper context
    const enhancedStatus =
      await this.enhancementService.enhanceAttendanceStatus(
        serializedLatest,
        windowResponse,
        validationContext,
      );

    // Update base response with all records
    enhancedStatus.base.latestAttendance = serializedLatest;
    enhancedStatus.base.additionalRecords = serializedRecords;
    enhancedStatus.base.validation = {
      canCheckIn: enhancedStatus.validation.allowed && !activeRecord,
      canCheckOut: enhancedStatus.validation.allowed && Boolean(activeRecord),
      message: enhancedStatus.validation.reason || '',
    };

    // Track final state
    stateTracker.stateUpdates.push({
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
      hasOvertimeInfo: !!enhancedStatus.context?.nextPeriod?.overtimeInfo,
      type: 'final',
    });

    // Log state tracking results
    console.log('State tracking summary:', {
      updates: stateTracker.stateUpdates,
      preservedState: !!stateTracker.originalState?.overtimeInfo,
      finalState: !!enhancedStatus.context?.nextPeriod?.overtimeInfo,
    });

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

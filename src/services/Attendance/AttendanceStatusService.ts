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
import { format } from 'date-fns';

interface GetAttendanceStatusOptions {
  inPremises: boolean;
  address: string;
  periodType?: PeriodType;
}

export class AttendanceStatusService {
  constructor(
    private readonly shiftService: ShiftManagementService,
    private readonly enhancementService: AttendanceEnhancementService,
    private readonly attendanceRecordService: AttendanceRecordService,
    private readonly cacheManager: CacheManager,
    private readonly periodManager: PeriodManagementService,
  ) {}

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
    const windowResponse: ShiftWindowResponse = {
      current: {
        start: periodState.current.timeWindow.start,
        end: periodState.current.timeWindow.end,
      },
      type: periodState.current.type,
      shift: shiftData.current,
      isHoliday: false, // Will be updated from context
      isDayOff: !shiftData.current.workDays.includes(now.getDay()),
      isAdjusted: shiftData.isAdjusted,
      overtimeInfo: periodState.overtime,
    };

    // Debug log window response
    console.log('Window response after creation:', {
      type: windowResponse.type,
      hasOvertime: !!windowResponse.overtimeInfo,
      overtimeDetails: windowResponse.overtimeInfo
        ? {
            id: windowResponse.overtimeInfo.id,
            startTime: windowResponse.overtimeInfo.startTime,
            endTime: windowResponse.overtimeInfo.endTime,
          }
        : null,
    });

    // Get latest record and serialize it
    const latestRecord = activeRecord || allRecords[0] || null;
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

    // Cache the result
    await cacheService.del(forceRefreshKey);
    await this.cacheManager.cacheAttendanceState(employeeId, enhancedStatus);

    // Log final state with complete overtime info
    console.log('Final enhanced status:', {
      hasTransitions: enhancedStatus.daily.transitions.length > 0,
      hasShift: Boolean(enhancedStatus.context.shift.id),
      hasOvertime: Boolean(enhancedStatus.context.nextPeriod?.overtimeInfo),
      overtimeInfo: enhancedStatus.context.nextPeriod?.overtimeInfo,
      transitionState: enhancedStatus.context.transition,
      timestamp: format(now, 'yyyy-MM-dd HH:mm:ss'),
    });

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

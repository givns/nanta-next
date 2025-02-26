// services/Attendance/AttendanceService.ts
import { PeriodType, PrismaClient } from '@prisma/client';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { AttendanceStatusService } from './AttendanceStatusService';
import {
  ProcessingOptions,
  ProcessingResult,
  AttendanceStatusResponse,
  SerializedAttendanceRecord,
  StateValidation,
  AppError,
  ErrorCode,
  ValidationContext,
} from '@/types/attendance';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { AttendanceMappers } from './utils/AttendanceMappers';
import { AttendanceEnhancementService } from './AttendanceEnhancementService';
import { PeriodManagementService } from './PeriodManagementService';
import { CacheManager } from '../cache/CacheManager';
import { TimeEntryService } from '../TimeEntryService';
import { AttendanceRecordService } from './AttendanceRecordService';
import { AttendanceStateManager } from './AttendanceStateManager';
import { getCurrentTime } from '@/utils/dateUtils';

export class AttendanceService {
  private readonly processingService: AttendanceProcessingService;
  private readonly statusService: AttendanceStatusService;
  private readonly stateManager: AttendanceStateManager;
  private readonly mappers: AttendanceMappers;
  private readonly shiftService: ShiftManagementService;

  constructor(
    prisma: PrismaClient,
    shiftService: ShiftManagementService,
    enhancementService: AttendanceEnhancementService,
    periodManager: PeriodManagementService,
    cacheManager: CacheManager,
    timeEntryService: TimeEntryService,
    attendanceRecordService: AttendanceRecordService,
  ) {
    this.mappers = new AttendanceMappers();
    this.shiftService = shiftService;
    this.stateManager = AttendanceStateManager.getInstance();

    // Initialize specialized services
    this.processingService = new AttendanceProcessingService(
      prisma,
      shiftService,
      timeEntryService,
      enhancementService,
      periodManager,
    );
    this.statusService = new AttendanceStatusService(
      shiftService,
      enhancementService,
      attendanceRecordService,
      cacheManager,
      periodManager,
    );
  }

  private attendanceStateCache = new Map<
    string,
    {
      state: AttendanceStatusResponse;
      timestamp: number;
    }
  >();

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    try {
      // Check for pending operations - fast in-memory check
      const hasPending = await this.stateManager.hasPendingOperation(
        options.employeeId,
      );

      if (hasPending) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Another operation is in progress',
        });
      }

      // Process attendance using processing service
      const result = await this.processingService.processAttendance(options);

      // If successful, update state in state manager
      if (result.success) {
        try {
          // Get full state after processing
          const updatedState = await this.getAttendanceStatus(
            options.employeeId,
            {
              inPremises: options.location?.inPremises || false,
              address: options.location?.address || '',
              periodType: options.periodType,
            },
          );

          // Update state in the background - don't wait
          this.stateManager
            .updateState(
              options.employeeId,
              updatedState,
              options.activity.isCheckIn ? 'check-in' : 'check-out',
            )
            .catch((err) => {
              console.warn('State update error (non-critical):', err);
            });
        } catch (stateError) {
          console.warn(
            'State update preparation error (non-critical):',
            stateError,
          );
          // Continue with the result - state update is not critical to success
        }
      }

      return result;
    } catch (error) {
      console.error('Error processing attendance:', error);

      try {
        // Try to invalidate state but don't block on it
        await this.stateManager.invalidateState(options.employeeId);
      } catch (invalidateError) {
        console.warn(
          'State invalidation error (non-critical):',
          invalidateError,
        );
      }

      throw error;
    }
  }

  async getAttendanceStatus(
    employeeId: string,
    options: {
      inPremises: boolean;
      address: string;
      periodType?: PeriodType;
    },
  ): Promise<AttendanceStatusResponse> {
    const now = getCurrentTime();

    // Check memory cache first with a short TTL (5 seconds)
    const cached = this.attendanceStateCache.get(employeeId);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.state;
    }

    try {
      // Get shift data first for the validation context
      const shiftData = await this.shiftService.getEffectiveShift(
        employeeId,
        now,
      );
      if (!shiftData) {
        throw new AppError({
          code: ErrorCode.SHIFT_DATA_ERROR,
          message: 'No shift configuration found',
        });
      }

      // Create complete validation context as per interface
      const validationContext: ValidationContext = {
        // Core data
        employeeId,
        timestamp: now,
        isCheckIn: true, // Default, will be updated based on current state

        // Current state - will be populated based on current attendance if exists
        state: undefined,
        checkStatus: undefined,
        overtimeState: undefined,

        // Shift data
        shift: shiftData.current,

        // Additional contexts
        isOvertime: false, // Will be updated based on period type
        overtimeInfo: null, // Will be populated if overtime exists

        // Location data
        location: options.inPremises
          ? {
              lat: 0,
              lng: 0,
              accuracy: undefined,
              timestamp: new Date(),
              provider: 'system',
            }
          : undefined,
        address: options.address,

        // Processing metadata
        periodType: options.periodType,
      };

      // Try to get from state manager first
      const cachedState = await this.stateManager.getState(
        employeeId,
        validationContext,
      );

      if (cachedState) {
        // Update validation context with cached state data
        validationContext.isCheckIn = cachedState.base.isCheckingIn;
        validationContext.state = cachedState.base.state;
        validationContext.checkStatus = cachedState.base.checkStatus;
        validationContext.overtimeState =
          cachedState.base.periodInfo.overtimeState;

        const isValid = await this.validateCachedState(cachedState);
        if (isValid) {
          return cachedState;
        }
      }

      // Get fresh state from status service
      const freshState = await this.statusService.getAttendanceStatus(
        employeeId,
        options,
      );

      // Update state manager with fresh state
      await this.stateManager.updateState(
        employeeId,
        freshState,
        freshState.base.isCheckingIn ? 'check-in' : 'check-out',
      );

      this.attendanceStateCache.set(employeeId, {
        state: freshState,
        timestamp: Date.now(),
      });

      return freshState;
    } catch (error) {
      console.error('Error getting attendance status:', error);
      // Invalidate state on error to ensure fresh fetch next time
      await this.stateManager.invalidateState(employeeId);
      throw error;
    }
  }

  async validateCheckInOut(
    employeeId: string,
    options: {
      inPremises: boolean;
      address: string;
      periodType?: PeriodType;
    },
  ): Promise<StateValidation> {
    const status = await this.getAttendanceStatus(employeeId, options);
    return status.validation;
  }

  async getSerializedAttendance(
    employeeId: string,
  ): Promise<SerializedAttendanceRecord | null> {
    const record =
      await this.statusService.getLatestAttendanceRecord(employeeId);
    return record
      ? AttendanceMappers.toSerializedAttendanceRecord(record)
      : null;
  }

  private async validateCachedState(
    state: AttendanceStatusResponse,
  ): Promise<boolean> {
    // Add validation logic here
    // For example, check if the state is not too old
    const stateTime = new Date(state.base.metadata.lastUpdated);
    const now = new Date();
    const maxAge = 30 * 1000; // 30 seconds

    return now.getTime() - stateTime.getTime() < maxAge;
  }

  // Cleanup method (call this when shutting down the service)
  async cleanup(): Promise<void> {
    await this.stateManager.cleanup();
  }
}

/** @deprecated Use validateCheckInOut with new StateValidation return type */
//async isCheckInOutAllowed(

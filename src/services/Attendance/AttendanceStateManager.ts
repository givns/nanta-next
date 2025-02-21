// services/Attendance/AttendanceStateManager.ts

import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  AttendanceStatusResponse,
  AppError,
  ErrorCode,
  ValidationContext,
  UnifiedPeriodState,
  StateValidation,
} from '@/types/attendance';
import Redis from 'ioredis';
import { getCurrentTime } from '@/utils/dateUtils';
import { format } from 'date-fns';

interface StateEntry {
  status: AttendanceStatusResponse;
  timestamp: number;
  ttl: number;
}

interface PendingOperation {
  timestamp: number;
  type: 'check-in' | 'check-out';
  employeeId: string;
}

export class AttendanceStateManager {
  private static instance: AttendanceStateManager;
  private redis: Redis;
  private stateCache: Map<string, StateEntry> = new Map();
  private pendingOperations: Map<string, PendingOperation> = new Map();

  // Cache configuration
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds
  private readonly STATE_PREFIX = 'attendance:state:';
  private readonly LOCK_PREFIX = 'attendance:lock:';

  private constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
    this.initializeCleanup();
  }

  static getInstance(): AttendanceStateManager {
    if (!this.instance) {
      this.instance = new AttendanceStateManager();
    }
    return this.instance;
  }

  private initializeCleanup() {
    setInterval(() => {
      const now = Date.now();

      // Cleanup state cache
      for (const [key, entry] of this.stateCache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.stateCache.delete(key);
        }
      }

      // Cleanup pending operations
      for (const [key, operation] of this.pendingOperations.entries()) {
        if (now - operation.timestamp > 60000) {
          // 1 minute timeout
          this.pendingOperations.delete(key);
        }
      }
    }, 30000); // Run cleanup every 30 seconds
  }

  async getState(
    employeeId: string,
    context: ValidationContext,
  ): Promise<AttendanceStatusResponse> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;

    try {
      // Check memory cache first
      const cachedState = this.stateCache.get(cacheKey);
      if (cachedState && Date.now() - cachedState.timestamp < cachedState.ttl) {
        return cachedState.status;
      }

      // Check Redis cache
      const redisState = await this.redis.get(cacheKey);
      if (redisState) {
        const parsedState = JSON.parse(redisState) as AttendanceStatusResponse;
        this.stateCache.set(cacheKey, {
          status: parsedState,
          timestamp: Date.now(),
          ttl: this.CACHE_TTL,
        });
        return parsedState;
      }

      return this.createInitialState(employeeId, context);
    } catch (error) {
      console.error('Error getting attendance state:', error);
      throw new AppError({
        code: ErrorCode.CACHE_ERROR,
        message: 'Failed to get attendance state',
        originalError: error,
      });
    }
  }

  async updateState(
    employeeId: string,
    newState: AttendanceStatusResponse,
    operationType: 'check-in' | 'check-out',
  ): Promise<void> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;
    const lockKey = `${this.LOCK_PREFIX}${employeeId}`;

    try {
      // Try to acquire lock
      const locked = await this.redis.set(lockKey, '1', 'EX', 30, 'NX');
      if (!locked) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Concurrent operation in progress',
        });
      }

      // Track pending operation
      this.pendingOperations.set(employeeId, {
        timestamp: Date.now(),
        type: operationType,
        employeeId,
      });

      // Update both caches
      await this.redis.set(cacheKey, JSON.stringify(newState), 'EX', 30);
      this.stateCache.set(cacheKey, {
        status: newState,
        timestamp: Date.now(),
        ttl: this.CACHE_TTL,
      });

      // Remove pending operation
      this.pendingOperations.delete(employeeId);
    } finally {
      // Release lock
      await this.redis.del(lockKey);
    }
  }

  async invalidateState(employeeId: string): Promise<void> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;

    try {
      // Remove from both caches
      await this.redis.del(cacheKey);
      this.stateCache.delete(cacheKey);
    } catch (error) {
      console.error('Error invalidating state:', error);
    }
  }

  async hasPendingOperation(employeeId: string): Promise<boolean> {
    return this.pendingOperations.has(employeeId);
  }

  private createInitialState(
    employeeId: string,
    context: ValidationContext,
  ): AttendanceStatusResponse {
    const now = getCurrentTime();

    return {
      daily: {
        date: format(now, 'yyyy-MM-dd'),
        currentState: this.createInitialPeriodState(context),
        transitions: [],
      },
      base: {
        state: AttendanceState.ABSENT,
        checkStatus: CheckStatus.PENDING,
        isCheckingIn: true,
        latestAttendance: null,
        periodInfo: {
          type: PeriodType.REGULAR,
          isOvertime: false,
          overtimeState: undefined,
        },
        validation: {
          canCheckIn: true,
          canCheckOut: false,
          message: '',
        },
        metadata: {
          lastUpdated: now.toISOString(),
          version: 1,
          source: 'system',
        },
      },
      context: {
        shift: context.shift!,
        schedule: {
          isHoliday: false,
          isDayOff: false,
          isAdjusted: false,
        },
        nextPeriod: null,
        transition: undefined,
      },
      validation: this.createInitialValidation(),
    };
  }

  private createInitialPeriodState(
    context: ValidationContext,
  ): UnifiedPeriodState {
    return {
      type: context.periodType || PeriodType.REGULAR,
      timeWindow: {
        start: format(getCurrentTime(), "yyyy-MM-dd'T'HH:mm:ss"),
        end: format(getCurrentTime(), "yyyy-MM-dd'T'HH:mm:ss"),
      },
      activity: {
        isActive: false,
        checkIn: null,
        checkOut: null,
        isOvertime: false,
        isDayOffOvertime: false,
      },
      validation: {
        isWithinBounds: true,
        isEarly: false,
        isLate: false,
        isOvernight: false,
        isConnected: false,
      },
    };
  }

  private createInitialValidation(): StateValidation {
    return {
      allowed: true,
      reason: '',
      flags: {
        isCheckingIn: true,
        hasActivePeriod: false,
        isLateCheckIn: false,
        isEarlyCheckIn: false,
        isLateCheckOut: false,
        isVeryLateCheckOut: false,
        isMorningShift: false,
        isAfternoonShift: false,
        isAfterMidshift: false,
        isInsideShift: true,
        isOutsideShift: false,
        isOvertime: false,
        isDayOffOvertime: false,
        hasPendingTransition: false,
        requiresTransition: false,
        requiresAutoCompletion: false,
        isAutoCheckIn: false,
        isAutoCheckOut: false,
        requireConfirmation: false,
        isPendingOvertime: false,
        isEarlyCheckOut: false,
        isPlannedHalfDayLeave: false,
        isEmergencyLeave: false,
        isApprovedEarlyCheckout: false,
        isHoliday: false,
        isDayOff: false,
        isManualEntry: false,
      },
    };
  }

  async cleanup(): Promise<void> {
    await this.redis.quit();
  }
}

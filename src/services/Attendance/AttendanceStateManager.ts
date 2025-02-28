// services/Attendance/AttendanceStateManager.ts

import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  AttendanceStatusResponse,
  ValidationContext,
  UnifiedPeriodState,
  StateValidation,
} from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { format } from 'date-fns';
import { cacheService } from '../cache/CacheService';

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
  // private redis: Redis | null = null; // Commented out, using CacheService instead
  private stateCache: Map<string, StateEntry> = new Map();
  private pendingOperations: Map<string, PendingOperation> = new Map();

  // Circuit breaker properties
  private bypassRedisCompletely = true; // Set to true to use memory-only cache

  private readonly CIRCUIT_RESET_TIME = 60000; // Try to use Redis again after 1 minute

  // Cache configuration
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds
  private readonly STATE_PREFIX = 'attendance:state:';

  private constructor() {
    console.log('AttendanceStateManager using CacheService for caching');
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

    // Check memory cache first
    const cachedState = this.stateCache.get(cacheKey);
    if (cachedState && Date.now() - cachedState.timestamp < cachedState.ttl) {
      return cachedState.status;
    }

    // Skip Redis completely if bypassing
    if (this.bypassRedisCompletely) {
      return this.createInitialState(employeeId, context);
    }

    // Try using CacheService
    try {
      const redisState = await cacheService.get(cacheKey);

      if (redisState) {
        try {
          const parsedState = JSON.parse(
            redisState,
          ) as AttendanceStatusResponse;

          // Update memory cache
          this.stateCache.set(cacheKey, {
            status: parsedState,
            timestamp: Date.now(),
            ttl: this.CACHE_TTL,
          });

          return parsedState;
        } catch (parseError) {
          console.warn('Failed to parse state from cache:', parseError);
        }
      }
    } catch (error) {
      console.warn('Cache read failed:', error);
    }

    // Fallback to creating a new state
    return this.createInitialState(employeeId, context);
  }

  async updateState(
    employeeId: string,
    newState: AttendanceStatusResponse,
    operationType: 'check-in' | 'check-out',
  ): Promise<void> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;

    // Always update memory cache first
    this.stateCache.set(cacheKey, {
      status: newState,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL,
    });

    // Track pending operation - set it before cache operations
    this.pendingOperations.set(employeeId, {
      timestamp: Date.now(),
      type: operationType,
      employeeId,
    });

    // Skip Redis if bypassing completely
    if (!this.bypassRedisCompletely) {
      try {
        // Use fire-and-forget pattern with CacheService
        cacheService
          .set(
            cacheKey,
            JSON.stringify(newState),
            Math.floor(this.CACHE_TTL / 1000),
          )
          .catch((err) => console.warn('Background cache update failed:', err));
      } catch (error) {
        console.warn('Cache update failed:', error);
      }
    }

    // Always remove pending operation to avoid deadlocks
    this.pendingOperations.delete(employeeId);
  }

  async invalidateState(employeeId: string): Promise<void> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;

    // Always clear memory cache
    this.stateCache.delete(cacheKey);

    // Remove pending operations
    this.pendingOperations.delete(employeeId);

    // Skip Redis if bypassing completely
    if (!this.bypassRedisCompletely) {
      // Use CacheService to delete key
      cacheService
        .del(cacheKey)
        .catch((err) => console.warn('Background cache delete failed:', err));
    }
  }

  temporarilyDisableRedis(): void {
    this.bypassRedisCompletely = true;
    console.log('Redis has been disabled for AttendanceStateManager');
  }

  async hasPendingOperation(employeeId: string): Promise<boolean> {
    // Only check memory - much more reliable
    return this.pendingOperations.has(employeeId);
  }

  // Add this method to AttendanceStateManager class

  async resetAllStates(): Promise<{ success: boolean; count: number }> {
    try {
      // Clear all in-memory state
      const stateCount = this.stateCache.size;
      const pendingCount = this.pendingOperations.size;

      this.stateCache.clear();
      this.pendingOperations.clear();

      console.log('Reset all attendance states in memory', {
        statesCleared: stateCount,
        pendingOperationsCleared: pendingCount,
      });

      return {
        success: true,
        count: stateCount + pendingCount,
      };
    } catch (error) {
      console.error('Error resetting attendance states:', error);
      return {
        success: false,
        count: 0,
      };
    }
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
      errors: [],
      warnings: [],
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
    // Just clear the memory cache
    this.stateCache.clear();
    this.pendingOperations.clear();
  }
}

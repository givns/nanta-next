// services/Attendance/AttendanceStateManager.ts
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
  private redis: Redis | null = null;
  private stateCache: Map<string, StateEntry> = new Map();
  private pendingOperations: Map<string, PendingOperation> = new Map();

  // Circuit breaker properties
  private redisFailureCount: number = 0;
  private redisDisabled: boolean = false;
  private lastFailureTime: number = 0;
  private readonly REDIS_TIMEOUT = 500; // 500ms timeout for Redis operations
  private readonly MAX_FAILURES = 3; // After 3 failures, disable Redis temporarily
  private readonly CIRCUIT_RESET_TIME = 60000; // Try to use Redis again after 1 minute

  // Cache configuration
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds
  private readonly STATE_PREFIX = 'attendance:state:';
  private readonly LOCK_PREFIX = 'attendance:lock:';

  private constructor() {
    try {
      this.redis = new Redis(process.env.REDIS_URL!, {
        connectTimeout: 2000, // Connection timeout
        maxRetriesPerRequest: 1, // Reduce retries to fail faster
      });

      // Set up error handling for Redis
      this.redis.on('error', (err) => {
        console.error('Redis connection error:', err);
        this.recordRedisFailure();
      });
    } catch (e) {
      console.error('Failed to initialize Redis:', e);
      this.redis = null;
    }

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

      // Reset circuit breaker if enough time has passed
      if (
        this.redisDisabled &&
        now - this.lastFailureTime > this.CIRCUIT_RESET_TIME
      ) {
        console.log(
          'Resetting Redis circuit breaker, attempting to use Redis again',
        );
        this.redisDisabled = false;
        this.redisFailureCount = 0;
      }
    }, 30000); // Run cleanup every 30 seconds
  }

  // Record Redis failure for circuit breaker
  private recordRedisFailure() {
    this.redisFailureCount++;
    this.lastFailureTime = Date.now();

    if (this.redisFailureCount >= this.MAX_FAILURES) {
      console.log(
        `Redis failed ${this.redisFailureCount} times, disabling temporarily`,
      );
      this.redisDisabled = true;
    }
  }

  // Helper method to run Redis commands with timeout
  private async executeRedisCommand<T>(
    operation: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    // Skip Redis if disabled by circuit breaker
    if (this.redisDisabled || !this.redis) {
      return fallback;
    }

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error('Redis operation timed out')),
          this.REDIS_TIMEOUT,
        );
      });

      // Race the operation against the timeout
      return await Promise.race([operation(), timeoutPromise]);
    } catch (error) {
      console.warn('Redis operation failed:', error);
      this.recordRedisFailure();
      return fallback;
    }
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

    // Try Redis with timeout if not disabled
    if (!this.redisDisabled && this.redis) {
      try {
        const redisState = await this.executeRedisCommand(
          async () => this.redis!.get(cacheKey),
          null,
        );

        if (redisState && typeof redisState === 'string') {
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
            console.warn('Failed to parse Redis state:', parseError);
          }
        }
      } catch (error) {
        // Error already logged in executeRedisCommand
      }
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

    // Track pending operation - set it before Redis operations
    this.pendingOperations.set(employeeId, {
      timestamp: Date.now(),
      type: operationType,
      employeeId,
    });

    // Try to update Redis in the background
    if (!this.redisDisabled && this.redis) {
      try {
        // Use fire-and-forget pattern - don't await
        this.executeRedisCommand(
          async () =>
            this.redis!.set(
              cacheKey,
              JSON.stringify(newState),
              'EX',
              Math.floor(this.CACHE_TTL / 1000),
            ),
          'OK',
        ).catch((err) => console.warn('Background Redis update failed:', err));
      } catch (error) {
        // Errors already handled in executeRedisCommand
      }
    }

    // Always remove pending operation to avoid deadlocks
    // Do this AFTER initiating Redis operations but don't wait for them
    this.pendingOperations.delete(employeeId);
  }

  async invalidateState(employeeId: string): Promise<void> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;

    // Always clear memory cache
    this.stateCache.delete(cacheKey);

    // Remove pending operations
    this.pendingOperations.delete(employeeId);

    // Try to clear Redis in the background
    if (!this.redisDisabled && this.redis) {
      // Fire and forget - don't await
      this.executeRedisCommand(async () => this.redis!.del(cacheKey), 0).catch(
        (err) => console.warn('Background Redis delete failed:', err),
      );
    }
  }

  async hasPendingOperation(employeeId: string): Promise<boolean> {
    // Only check memory - much more reliable
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
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

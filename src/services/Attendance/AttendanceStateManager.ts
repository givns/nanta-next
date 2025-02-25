// services/Attendance/AttendanceStateManager.ts
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import {
  AttendanceStatusResponse,
  ValidationContext,
  UnifiedPeriodState,
  StateValidation,
  ErrorCode,
  AppError,
} from '@/types/attendance';
import Redis from 'ioredis';
import { getCurrentTime } from '@/utils/dateUtils';
import { format } from 'date-fns';
import { redisManager } from '../RedisConnectionManager';

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
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Cache configuration
  private readonly CACHE_TTL = 30 * 1000; // 30 seconds
  private readonly STATE_PREFIX = 'attendance:state:';
  private readonly LOCK_PREFIX = 'attendance:lock:';

  private constructor() {
    this.initializeRedisConnection();
    this.initializeCleanup();
  }

  private async initializeRedisConnection() {
    try {
      await redisManager.initialize();
      this.redis = redisManager.getClient();
      if (!this.redis) {
        console.warn('Redis client not available in AttendanceStateManager');
      }
    } catch (error) {
      console.error(
        'Failed to initialize Redis in AttendanceStateManager:',
        error,
      );
      // Continue without Redis - we'll fall back to memory cache
    }
  }

  static getInstance(): AttendanceStateManager {
    if (!this.instance) {
      this.instance = new AttendanceStateManager();
    }
    return this.instance;
  }

  private initializeCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();

      // 1. Cleanup memory state cache
      let expiredStateEntries = 0;
      for (const [key, entry] of this.stateCache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          this.stateCache.delete(key);
          expiredStateEntries++;
        }
      }

      // 2. Cleanup pending operations
      let expiredOperations = 0;
      for (const [key, operation] of this.pendingOperations.entries()) {
        if (now - operation.timestamp > 60000) {
          // 1 minute timeout
          this.pendingOperations.delete(key);
          expiredOperations++;
        }
      }

      // 3. Try to clean up stale Redis locks if Redis is available
      if (this.redis) {
        this.clearStaleLocks().catch((err) => {
          console.error(
            'Error clearing stale locks during cleanup interval:',
            err,
          );
        });
      }

      if (expiredStateEntries > 0 || expiredOperations > 0) {
        console.log(
          `Cleanup completed: removed ${expiredStateEntries} expired states and ${expiredOperations} expired operations`,
        );
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

      // Check Redis cache if available
      if (this.redis) {
        try {
          const redisState = await this.redis.get(cacheKey);
          if (redisState) {
            try {
              const parsedState = JSON.parse(
                redisState,
              ) as AttendanceStatusResponse;
              this.stateCache.set(cacheKey, {
                status: parsedState,
                timestamp: Date.now(),
                ttl: this.CACHE_TTL,
              });
              return parsedState;
            } catch (parseError) {
              console.error('Error parsing Redis state:', parseError);
              // Continue and return initial state
            }
          }
        } catch (redisError) {
          console.error(
            'Redis error when getting state, continuing with initial state:',
            redisError,
          );
          // Continue to initial state creation
        }
      }

      // Create and return initial state
      return this.createInitialState(context);
    } catch (error) {
      console.error('Error getting attendance state:', error);
      // Always return a valid state even if there's an error
      return this.createInitialState(context);
    }
  }

  // Modify the AttendanceStateManager.updateState method
  async updateState(
    employeeId: string,
    newState: AttendanceStatusResponse,
    operationType: 'check-in' | 'check-out',
  ): Promise<void> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;
    const lockKey = `${this.LOCK_PREFIX}${employeeId}`;

    // Always update memory cache first (this is fast and reliable)
    this.stateCache.set(cacheKey, {
      status: newState,
      timestamp: Date.now(),
      ttl: this.CACHE_TTL,
    });

    // Track operation in memory
    this.pendingOperations.set(employeeId, {
      timestamp: Date.now(),
      type: operationType,
      employeeId,
    });

    try {
      // Try to acquire lock with a short timeout (1 second max)
      if (this.redis) {
        const lockPromise = this.redis.set(lockKey, '1', 'EX', 30, 'NX');
        const timeoutPromise = new Promise((resolve) =>
          setTimeout(resolve, 1000, null),
        );
        const locked = await Promise.race([lockPromise, timeoutPromise]);

        if (!locked) {
          console.log(
            `Using memory-only mode for ${employeeId} - Redis lock timeout`,
          );
          return; // Early return, memory cache is already updated
        }
      } else {
        console.log(
          `Using memory-only mode for ${employeeId} - Redis is not available`,
        );
        return; // Early return, memory cache is already updated
      }

      try {
        // Update Redis cache with a timeout
        const setPromise = this.redis.set(
          cacheKey,
          JSON.stringify(newState),
          'EX',
          30,
        );
        await Promise.race([
          setPromise,
          new Promise((resolve) => setTimeout(resolve, 1000, null)),
        ]);
      } finally {
        // Always attempt to release the lock
        await this.redis.del(lockKey);
      }

      // Remove pending operation after Redis operations complete
      this.pendingOperations.delete(employeeId);
    } catch (error) {
      console.error(`Redis error in updateState for ${employeeId}:`, error);
      // Memory cache is already updated, so we can continue
    }
  }

  async invalidateState(employeeId: string): Promise<void> {
    const cacheKey = `${this.STATE_PREFIX}${employeeId}`;

    try {
      // Remove from memory cache
      this.stateCache.delete(cacheKey);

      // Remove from Redis if available
      if (this.redis) {
        try {
          await this.redis.del(cacheKey);
        } catch (error) {
          console.error('Error deleting Redis key:', error);
        }
      }
    } catch (error) {
      console.error('Error invalidating state:', error);
    }
  }

  async hasPendingOperation(employeeId: string): Promise<boolean> {
    return this.pendingOperations.has(employeeId);
  }

  /**
   * Check for and clear stale locks
   * This can help recover from deadlock situations
   */
  async clearStaleLocks(): Promise<number> {
    if (!this.redis) return 0;

    try {
      // Find all active locks
      const lockPattern = `${this.LOCK_PREFIX}*`;
      const lockKeys = await this.redis.keys(lockPattern);

      if (lockKeys.length === 0) return 0;

      console.log(
        `Found ${lockKeys.length} active locks, checking for stale ones...`,
      );

      let clearedLocks = 0;

      // Check each lock
      for (const lockKey of lockKeys) {
        // Skip info keys - we'll handle them with their parent lock
        if (lockKey.endsWith(':info')) continue;

        const infoKey = `${lockKey}:info`;
        const lockInfo = await this.redis.get(infoKey);

        if (lockInfo) {
          try {
            const lockData = JSON.parse(lockInfo);
            const lockTime = new Date(lockData.timestamp);
            const now = new Date();

            // If lock is older than 1 minute, consider it stale
            if (now.getTime() - lockTime.getTime() > 60000) {
              console.warn(
                `Clearing stale lock: ${lockKey}, created at ${lockData.timestamp}`,
              );
              await this.redis.del(lockKey);
              await this.redis.del(infoKey);
              clearedLocks++;
            }
          } catch (error) {
            console.error(`Error processing lock info for ${lockKey}:`, error);
            // Force clear if we can't parse the info
            await this.redis.del(lockKey);
            await this.redis.del(infoKey);
            clearedLocks++;
          }
        } else {
          // No info key found, this could be a lock without info
          // Get the TTL to see how old it is
          const ttl = await this.redis.ttl(lockKey);

          // If TTL is less than 20 seconds (out of 30), it's older than 10 seconds
          if (ttl < 20) {
            console.warn(
              `Clearing potential stale lock without info: ${lockKey}, TTL: ${ttl}`,
            );
            await this.redis.del(lockKey);
            clearedLocks++;
          }
        }
      }

      return clearedLocks;
    } catch (error) {
      console.error('Error clearing stale locks:', error);
      return 0;
    }
  }

  /**
   * Check if a specific employee has a lock
   * @param employeeId The employee ID to check
   * @returns Information about the lock if it exists
   */
  async checkEmployeeLock(employeeId: string): Promise<{
    hasLock: boolean;
    isStale: boolean;
    timestamp?: string;
    type?: 'check-in' | 'check-out';
  }> {
    if (!this.redis) {
      return { hasLock: false, isStale: false };
    }

    const lockKey = `${this.LOCK_PREFIX}${employeeId}`;
    const infoKey = `${lockKey}:info`;

    try {
      const exists = await this.redis.exists(lockKey);

      if (exists === 0) {
        return { hasLock: false, isStale: false };
      }

      const lockInfo = await this.redis.get(infoKey);

      if (!lockInfo) {
        return { hasLock: true, isStale: true };
      }

      try {
        const lockData = JSON.parse(lockInfo);
        const lockTime = new Date(lockData.timestamp);
        const now = new Date();

        return {
          hasLock: true,
          isStale: now.getTime() - lockTime.getTime() > 60000,
          timestamp: lockData.timestamp,
          type: lockData.type,
        };
      } catch (error) {
        return { hasLock: true, isStale: true };
      }
    } catch (error) {
      console.error(`Error checking lock for employee ${employeeId}:`, error);
      return { hasLock: false, isStale: false };
    }
  }

  private createInitialState(
    context: ValidationContext,
  ): AttendanceStatusResponse {
    const now =
      context.timestamp instanceof Date && !isNaN(context.timestamp.getTime())
        ? context.timestamp
        : getCurrentTime();

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
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // No need to quit Redis here as the connection is managed by RedisConnectionManager
    this.redis = null;
  }
}

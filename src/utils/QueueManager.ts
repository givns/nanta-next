// utils/QueueManager.ts
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';
import {
  ProcessingOptions,
  QueueResult,
  CACHE_CONSTANTS,
  AppError,
  ErrorCode,
} from '@/types/attendance';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { redisManager } from '../services/RedisConnectionManager';

// Global reference to the processing function
let processingFunction:
  | ((task: ProcessingOptions) => Promise<QueueResult>)
  | null = null;

export class QueueManager {
  private static instance: QueueManager | null = null;
  private queue!: BetterQueue<ProcessingOptions, QueueResult>;
  private queueSize: number = 0;
  private serviceQueue: ReturnType<typeof getServiceQueue>;
  private memoryLocks = new Map<string, number>();

  // In-memory request status cache
  private requestStatusMap = new Map<
    string,
    {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      completed: boolean;
      data: any;
      timestamp: number;
    }
  >();

  // In-memory locks
  private locks = new Map<string, { timestamp: number }>();

  private constructor() {
    console.log('QueueManager constructor called');
    this.serviceQueue = getServiceQueue();
    this.initializeQueue();
    this.startCleanupTimer();
  }

  static getInstance(): QueueManager {
    if (!QueueManager.instance) {
      console.log('Creating new QueueManager instance');
      QueueManager.instance = new QueueManager();
    }
    return QueueManager.instance;
  }

  // Set the processing function - to be called by the API route
  static setProcessingFunction(
    fn: (task: ProcessingOptions) => Promise<QueueResult>,
  ): void {
    processingFunction = fn;
    console.log('Processing function set');
  }

  static getProcessingFunction():
    | ((task: ProcessingOptions) => Promise<QueueResult>)
    | null {
    return processingFunction;
  }

  private initializeQueue() {
    this.queue = new BetterQueue<ProcessingOptions, QueueResult>(
      async (task, cb) => {
        try {
          // Try to acquire lock
          const lockKey = `lock:${task.employeeId}`;
          const lockAcquired = await redisManager.safeExecute(
            async (redis) => {
              // Redis SET with NX returns "OK" if successful, null if the key exists
              // Convert this to a boolean value
              const result = await redis.set(
                lockKey,
                '1',
                'EX',
                30, // 30 second expiry
                'NX', // Only set if key doesn't exist
              );
              return result === 'OK'; // Convert "OK" to true, null to false
            },
            false, // Now both the operation and fallback are boolean types
          );

          if (!lockAcquired) {
            throw new Error('Concurrent operation in progress');
          }

          try {
            const result = await this.processTask(task);
            this.queueSize--;
            cb(null, result);
          } finally {
            // Always release lock
            this.releaseLock(lockKey);
          }
        } catch (error) {
          this.queueSize--;
          cb(error as Error);
        }
      },
      {
        concurrent: 1,
        maxRetries: CACHE_CONSTANTS.MAX_RETRIES,
        retryDelay: CACHE_CONSTANTS.RETRY_DELAY,
        maxTimeout: CACHE_CONSTANTS.PROCESS_TIMEOUT,
        store: new MemoryStore(),
      },
    );

    this.queue.on('task_queued', () => {
      this.queueSize++;
    });

    this.queue.on('task_failed', () => {
      this.queueSize = Math.max(0, this.queueSize - 1);
    });

    this.queue.on('task_finish', () => {
      this.queueSize = Math.max(0, this.queueSize - 1);
    });
  }

  private startCleanupTimer() {
    // Clean up old status entries and locks every minute
    setInterval(() => {
      const now = Date.now();

      // Clean up old status entries
      for (const [key, value] of this.requestStatusMap.entries()) {
        if (now - value.timestamp > 60 * 60 * 1000) {
          // 1 hour TTL
          this.requestStatusMap.delete(key);
        }
      }

      // Clean up old locks
      for (const [key, value] of this.locks.entries()) {
        if (now - value.timestamp > 60 * 1000) {
          // 1 minute TTL
          this.locks.delete(key);
        }
      }
    }, 60 * 1000); // Run cleanup every minute
  }

  // Memory-based lock implementation
  async acquireLock(
    employeeId: string,
    ttlSeconds: number = 30,
  ): Promise<boolean> {
    const lockKey = `lock:${employeeId}`;

    try {
      // Try Redis first if available
      if (redisManager.isAvailable()) {
        const result = await redisManager.safeExecute(async (redis) => {
          const setResult = await redis.set(
            lockKey,
            '1',
            'EX',
            ttlSeconds,
            'NX',
          );
          return setResult === 'OK'; // Convert to boolean
        }, false);

        if (result) return true;
      }

      // Fall back to memory locks if Redis fails or isn't available
      console.warn('Redis lock failed or unavailable, using memory lock');
      const now = Date.now();
      const existing = this.memoryLocks.get(employeeId);

      if (existing && existing > now) return false;

      this.memoryLocks.set(employeeId, now + ttlSeconds * 1000);
      return true;
    } catch (error) {
      console.error('Lock acquisition failed:', error);

      // Still try memory lock as last resort
      const now = Date.now();
      this.memoryLocks.set(employeeId, now + ttlSeconds * 1000);
      return true;
    }
  }

  // Update the releaseLock method
  private releaseLock(key: string): void {
    // Release memory lock
    this.locks.delete(key);
    // Remove from memoryLocks too
    const employeeId = key.replace('lock:', '');
    this.memoryLocks.delete(employeeId);

    // Try to release Redis lock
    if (redisManager.isAvailable()) {
      redisManager
        .safeExecute((redis) => redis.del(key), 0)
        .catch((e) => {
          console.warn('Error releasing Redis lock:', e);
        }); // Log Redis errors
    }
  }

  setRequestStatus(
    requestId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    data?: any,
  ): void {
    const statusEntry = {
      status,
      completed: status === 'completed',
      data: data || null,
      timestamp: Date.now(),
    };

    console.log(`Setting request status for ${requestId} to ${status}`);

    // Always update memory cache
    this.requestStatusMap.set(requestId, statusEntry);

    // Try to update Redis
    const redisKey = `request:${requestId}`;
    if (redisManager.isAvailable()) {
      redisManager
        .safeSet(
          redisKey,
          JSON.stringify(statusEntry),
          3600, // 1 hour TTL
        )
        .catch((e) => {
          console.warn('Failed to set Redis status:', e);
        });
    }
  }

  // Get request status with fallback mechanisms
  async getRequestStatus(requestId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
    completed: boolean;
    data: any;
  }> {
    // Check memory cache first
    const memoryStatus = this.requestStatusMap.get(requestId);
    if (memoryStatus) {
      console.log(
        `Found status for ${requestId} in memory: ${memoryStatus.status}`,
      );
      return memoryStatus;
    }

    // Try Redis if available
    if (redisManager.isAvailable()) {
      try {
        const redisKey = `request:${requestId}`;
        const redisStatus = await redisManager.safeGet(redisKey);

        if (redisStatus) {
          try {
            const parsedStatus = JSON.parse(redisStatus);
            // Cache in memory for faster future access
            this.requestStatusMap.set(requestId, parsedStatus);
            console.log(
              `Found status for ${requestId} in Redis: ${parsedStatus.status}`,
            );
            return parsedStatus;
          } catch (parseError) {
            console.error('Error parsing Redis status:', parseError);
          }
        }
      } catch (error) {
        console.warn('Redis status lookup failed:', error);
      }
    }

    console.log(`No status found for ${requestId}, returning unknown`);
    return {
      status: 'unknown',
      completed: false,
      data: null,
    };
  }

  // Enqueue task with improved error handling
  async enqueue(task: ProcessingOptions): Promise<QueueResult> {
    if (!task.requestId) {
      task.requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    console.log(`Enqueueing task with requestId ${task.requestId}`);

    // Set initial status
    this.setRequestStatus(task.requestId, 'pending');

    return new Promise<QueueResult>((resolve, reject) => {
      this.queue.push(task, (error, result) => {
        if (error) {
          console.error(`Task ${task.requestId} failed:`, error);
          this.setRequestStatus(task.requestId!, 'failed', {
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          reject(error);
        } else {
          console.log(`Task ${task.requestId} completed successfully`);
          this.setRequestStatus(task.requestId!, 'completed', result);
          resolve(result!);
        }
      });
    });
  }

  // Process task with improved error handling
  private async processTask(task: ProcessingOptions): Promise<QueueResult> {
    const lockKey = `lock:${task.employeeId}`;
    let lockAcquired = false;

    try {
      // Set status to processing
      if (task.requestId) {
        this.setRequestStatus(task.requestId, 'processing');
      }

      console.log(
        `Processing task ${task.requestId} for employee ${task.employeeId}`,
      );

      // Get initialized services before processing
      console.log(`Getting services for task ${task.requestId}`);
      const services = await this.serviceQueue.getInitializedServices();
      if (!services) {
        throw new AppError({
          code: ErrorCode.SERVICE_INITIALIZATION_ERROR,
          message: 'Services not initialized',
        });
      }

      // Check if processing function is set
      if (!processingFunction) {
        throw new AppError({
          code: ErrorCode.PROCESSING_ERROR,
          message: 'Processing function not initialized',
        });
      }

      // Use the processing function
      console.log(`Executing processing function for task ${task.requestId}`);
      const result = await processingFunction(task);
      console.log(`Processing completed for task ${task.requestId}`);
      return result;
    } catch (error) {
      console.error(`Task processing error for ${task.requestId}:`, error);
      throw error;
    }
  }

  // Check queue status
  async getQueueStatus(employeeId: string): Promise<{
    isPending: boolean;
    position?: number;
  }> {
    // Check memory lock first
    const lockKey = `lock:${employeeId}`;
    const isLocked =
      this.locks.has(lockKey) ||
      (this.memoryLocks.get(employeeId) || 0) > Date.now();

    // Try Redis lock if not locked in memory
    if (!isLocked && redisManager.isAvailable()) {
      try {
        const redisLocked = await redisManager.safeExecute(
          (redis) => redis.exists(lockKey),
          0,
        );

        return {
          isPending: redisLocked === 1,
          position: this.queueSize,
        };
      } catch (error) {
        console.warn('Redis queue status check failed:', error);
      }
    }

    return {
      isPending: isLocked,
      position: this.queueSize,
    };
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.destroy(() => {
        resolve();
      });
    });
  }
}

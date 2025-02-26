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
  [x: string]: any;
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

  private initializeQueue() {
    this.queue = new BetterQueue<ProcessingOptions, QueueResult>(
      async (task, cb) => {
        try {
          // Try to acquire lock
          const lockKey = `lock:${task.employeeId}`;
          const lockAcquired =
            await this.RedisConnectionManager.safeExecutesafeExecuteRedis(
              async (redis: {
                set: (
                  arg0: string,
                  arg1: string,
                  arg2: string,
                  arg3: number,
                  arg4: string,
                ) => any;
              }) => {
                return await redis.set(
                  lockKey,
                  '1',
                  'EX',
                  30, // 30 second expiry
                  'NX', // Only set if key doesn't exist
                );
              },
              false,
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
      // Try Redis first
      const result = await this.redis
        .set(lockKey, '1', 'EX', ttlSeconds, 'NX')
        .timeout(3000)
        .catch(() => null);

      if (result === 'OK') return true;

      // Fall back to memory locks if Redis fails
      if (result === null) {
        console.warn('Redis lock failed, using memory lock');
        const now = Date.now();
        const existing = this.memoryLocks.get(employeeId);

        if (existing && existing > now) return false;

        this.memoryLocks.set(employeeId, now + ttlSeconds * 1000);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Lock acquisition failed:', error);
      return false;
    }
  }

  private releaseLock(key: string): void {
    // Release memory lock
    this.locks.delete(key);

    // Try to release Redis lock
    if (redisManager.isAvailable()) {
      redisManager.safeExecute((redis) => redis.del(key), 0).catch(() => {}); // Ignore Redis errors
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

    // Always update memory cache
    this.requestStatusMap.set(requestId, statusEntry);

    // Try to update Redis
    const redisKey = `request:${requestId}`;
    redisManager
      .safeSet(
        redisKey,
        JSON.stringify(statusEntry),
        3600, // 1 hour TTL
      )
      .catch(() => {}); // Ignore Redis errors
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
      return memoryStatus;
    }

    // Try Redis if available
    try {
      const redisKey = `request:${requestId}`;
      const redisStatus = await redisManager.safeGet(redisKey);

      if (redisStatus) {
        try {
          const parsedStatus = JSON.parse(redisStatus);
          // Cache in memory for faster future access
          this.requestStatusMap.set(requestId, parsedStatus);
          return parsedStatus;
        } catch (parseError) {
          console.error('Error parsing Redis status:', parseError);
        }
      }
    } catch (error) {
      // Ignore Redis errors, continue with unknown status
    }

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

    // Set initial status
    this.setRequestStatus(task.requestId, 'pending');

    return new Promise<QueueResult>((resolve, reject) => {
      this.queue.push(task, (error, result) => {
        if (error) {
          this.setRequestStatus(task.requestId!, 'failed', {
            error: error.message,
            timestamp: new Date().toISOString(),
          });
          reject(error);
        } else {
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
      // Try to acquire lock with shorter timeout
      lockAcquired = await this.redis
        .set(lockKey, '1', 'EX', 30, 'NX')
        .timeout(3000)
        .catch(() => false);

      if (!lockAcquired) {
        throw new Error('Concurrent operation in progress');
      }
      if (task.requestId) {
        this.setRequestStatus(task.requestId, 'processing');
      }

      // Get initialized services before processing
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
      const result = await processingFunction(task);
      return result;
    } catch (error) {
      console.error('Task processing error:', error);
      throw error;
    } finally {
      // Always try to release lock, with backoff if needed
      if (lockAcquired) {
        await this.safeDelKey(lockKey);
      }
    }
  }

  // Check queue status
  async getQueueStatus(employeeId: string): Promise<{
    isPending: boolean;
    position?: number;
  }> {
    // Check memory lock first
    const lockKey = `lock:${employeeId}`;
    const isLocked = this.locks.has(lockKey);

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
        // Ignore Redis errors, use memory state
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

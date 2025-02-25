// utils/QueueManager.ts
import BetterQueue from 'better-queue';
import Redis from 'ioredis';
import MemoryStore from 'better-queue-memory';
import {
  ProcessingOptions,
  QueueResult,
  CACHE_CONSTANTS,
  AppError,
  ErrorCode,
} from '@/types/attendance';
import { ServiceInitializationQueue } from '@/utils/ServiceInitializationQueue';
import { processCheckInOut } from '@/pages/api/attendance/check-in-out';

export class QueueManager {
  private static instance: QueueManager;
  private queue!: BetterQueue<ProcessingOptions, QueueResult>;
  private redis: Redis;
  private queueSize: number = 0;
  private serviceQueue: ServiceInitializationQueue;

  private constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
    this.serviceQueue = ServiceInitializationQueue.getInstance();
    this.initializeQueue();
  }

  private requestStatusMap = new Map<
    string,
    {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      completed: boolean;
      data: any;
      timestamp: number;
    }
  >();

  static getInstance(): QueueManager {
    if (!this.instance) {
      this.instance = new QueueManager();
    }
    return this.instance;
  }

  private initializeQueue() {
    this.queue = new BetterQueue<ProcessingOptions, QueueResult>(
      async (task, cb) => {
        try {
          // Try to acquire lock using Redis SET with options
          const lockKey = `lock:${task.employeeId}`;
          const lockAcquired = await this.redis.set(
            lockKey,
            '1',
            'EX',
            30, // 30 second expiry
            'NX', // Only set if key doesn't exist
          );

          if (!lockAcquired) {
            throw new Error('Concurrent operation in progress');
          }

          try {
            const result = await this.processTask(task);
            this.queueSize--;
            cb(null, result);
          } finally {
            await this.redis.del(lockKey);
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

  setRequestStatus(
    requestId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    data?: any,
  ): void {
    this.requestStatusMap.set(requestId, {
      status,
      completed: status === 'completed',
      data: data || null,
      timestamp: Date.now(),
    });

    // Remove old statuses after 1 hour
    setTimeout(
      () => {
        this.requestStatusMap.delete(requestId);
      },
      60 * 60 * 1000,
    );
  }

  // Add method to get request status
  async getRequestStatus(requestId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
    completed: boolean;
    data: any;
  }> {
    const status = this.requestStatusMap.get(requestId);

    if (!status) {
      return {
        status: 'unknown',
        completed: false,
        data: null,
      };
    }

    return status;
  }

  // Update the enqueue method
  async enqueue(task: ProcessingOptions): Promise<QueueResult> {
    // Set initial status
    if (task.requestId) {
      this.setRequestStatus(task.requestId, 'pending');
    }

    return new Promise((resolve, reject) => {
      this.queue.push(task, (error, result) => {
        if (error) {
          if (task.requestId) {
            this.setRequestStatus(task.requestId, 'failed', {
              error: error.message,
            });
          }
          reject(error);
        } else {
          if (task.requestId) {
            this.setRequestStatus(task.requestId, 'completed', result);
          }
          resolve(result!);
        }
      });
    });
  }

  // Update the processTask method
  private async processTask(task: ProcessingOptions): Promise<QueueResult> {
    try {
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

      // Use the existing processCheckInOut function
      const result = await processCheckInOut(task);
      return result;
    } catch (error) {
      console.error('Task processing error:', error);

      throw error;
    }
  }

  async getQueueStatus(employeeId: string): Promise<{
    isPending: boolean;
    position?: number;
  }> {
    const lockKey = `lock:${employeeId}`;
    const isLocked = await this.redis.exists(lockKey);
    return {
      isPending: isLocked === 1,
      position: this.queueSize,
    };
  }

  async cleanup(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.destroy(() => {
        this.redis.quit().then(() => resolve());
      });
    });
  }
}

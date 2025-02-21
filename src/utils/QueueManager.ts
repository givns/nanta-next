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
import type { InitializedServices } from '@/types/attendance';
import { processCheckInOut } from '@/pages/api/attendance/check-in-out';

export class QueueManager {
  private static instance: QueueManager;
  private queue!: BetterQueue<ProcessingOptions, QueueResult>;
  private redis: Redis;
  private queueSize: number = 0;
  private services: InitializedServices | null = null;

  private constructor() {
    this.redis = new Redis(process.env.REDIS_URL!);
    this.initializeQueue();
  }

  static getInstance(): QueueManager {
    if (!this.instance) {
      this.instance = new QueueManager();
    }
    return this.instance;
  }

  setServices(services: InitializedServices) {
    this.services = services;
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
        store: new MemoryStore(), // Fixed MemoryStore usage
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

  private async processTask(task: ProcessingOptions): Promise<QueueResult> {
    if (!this.services) {
      throw new AppError({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Services not initialized',
      });
    }

    try {
      // Use the existing processCheckInOut function from the original file
      const result = await processCheckInOut(task);
      return result;
    } catch (error) {
      console.error('Task processing error:', error);
      throw error;
    }
  }

  async enqueue(task: ProcessingOptions): Promise<QueueResult> {
    return new Promise((resolve, reject) => {
      this.queue.push(task, (error, result) => {
        if (error) reject(error);
        else resolve(result!);
      });
    });
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

  // Fixed cleanup method
  async cleanup(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.destroy(() => {
        this.redis.quit().then(() => resolve());
      });
    });
  }
}

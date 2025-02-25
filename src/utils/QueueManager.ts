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
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';

// Global reference to the processing function
let processingFunction:
  | ((task: ProcessingOptions) => Promise<QueueResult>)
  | null = null;

export class QueueManager {
  private static instance: QueueManager | null = null;
  private queue!: BetterQueue<ProcessingOptions, QueueResult>; // Using ! to tell TypeScript this will be assigned
  private redis: Redis;
  private queueSize: number = 0;
  private serviceQueue: ReturnType<typeof getServiceQueue>;

  private requestStatusMap = new Map<
    string,
    {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      completed: boolean;
      data: any;
      timestamp: number;
    }
  >();

  private constructor() {
    console.log('QueueManager constructor called');
    this.redis = new Redis(process.env.REDIS_URL!);
    this.serviceQueue = getServiceQueue();
    this.initializeQueue();
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

  // Get request status
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

  // Enqueue task
  async enqueue(task: ProcessingOptions): Promise<QueueResult> {
    // Set initial status
    if (task.requestId) {
      this.setRequestStatus(task.requestId, 'pending');
    }

    return new Promise<QueueResult>((resolve, reject) => {
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

  // Process task
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
    return new Promise<void>((resolve) => {
      this.queue.destroy(() => {
        this.redis.quit().then(() => resolve());
      });
    });
  }
}

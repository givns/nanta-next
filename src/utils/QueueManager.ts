// utils/QueueManager.ts
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';
import { ProcessingOptions, QueueResult } from '@/types/attendance';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { redisManager } from '../services/RedisConnectionManager';
import { processCheckInOut } from '../pages/api/attendance/check-in-out'; // Import the processing function

// Global reference to the processing function
let processingFunction:
  | ((task: ProcessingOptions) => Promise<QueueResult>)
  | null = null;

export class QueueManager {
  private static instance: QueueManager | null = null;
  private queue!: BetterQueue<ProcessingOptions, QueueResult>;
  private queueSize: number = 0;
  private serviceQueue: ReturnType<typeof getServiceQueue>;

  // In-memory request status cache
  private requestStatusMap = new Map<
    string,
    {
      status: 'pending' | 'processing' | 'completed' | 'failed';
      completed: boolean;
      data: any;
      timestamp: number;
      error?: string;
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
        console.log(`Queue worker starting task ${task.requestId}`);

        // Define these variables in the outer scope so they're available in finally
        let lockAcquired = false;
        const lockKey = `lock:${task.employeeId}`;

        try {
          // Set status to processing immediately
          if (task.requestId) {
            this.setRequestStatus(task.requestId, 'processing');
          }

          // Try to acquire lock - but don't fail if it can't be acquired
          try {
            lockAcquired = await redisManager.safeExecute(async (redis) => {
              const result = await redis.set(
                lockKey,
                '1',
                'EX',
                30, // 30 second expiry
                'NX', // Only set if key doesn't exist
              );
              return result === 'OK'; // Convert to boolean
            }, false);

            if (!lockAcquired) {
              console.log(
                `Could not acquire Redis lock for ${task.requestId}, continuing anyway`,
              );
            }
          } catch (lockError) {
            console.warn(
              `Lock acquisition error for ${task.requestId}, continuing:`,
              lockError,
            );
          }

          // Process the task with timeout
          console.log(`Processing task ${task.requestId} with timeout`);

          // Use a shorter timeout here - 10 seconds max for queue processing
          const processFn = processingFunction || processCheckInOut;
          if (!processFn) {
            throw new Error('No processing function available');
          }

          try {
            // Process with a shorter timeout for background tasks
            const result = await Promise.race([
              processFn(task),
              new Promise<never>(
                (_, reject) =>
                  setTimeout(
                    () => reject(new Error('Queue processing timeout')),
                    10000,
                  ), // 10 second timeout
              ),
            ]);

            console.log(`Task ${task.requestId} completed successfully`);

            // Update status on success - CRITICAL to update status correctly
            if (task.requestId) {
              this.setRequestStatus(task.requestId, 'completed', result);
            }

            // Complete the queue task
            this.queueSize--;
            cb(null, result);
          } catch (processError) {
            console.error(
              `Error processing task ${task.requestId}:`,
              processError,
            );

            // Update status on failure - CRITICAL to update status correctly
            if (task.requestId) {
              this.setRequestStatus(task.requestId, 'failed', {
                error:
                  processError instanceof Error
                    ? processError.message
                    : 'Unknown error',
                timestamp: new Date().toISOString(),
              });
            }

            this.queueSize--;
            cb(processError as Error);
          }
        } finally {
          // Always release any acquired lock
          if (lockAcquired) {
            this.releaseLock(lockKey);
          }
        }
      },
      {
        concurrent: 1,
        maxRetries: 1, // Only try once - don't retry failed tasks
        retryDelay: 1000,
        maxTimeout: 15000, // 15 seconds max timeout
        store: new MemoryStore(),
      },
    );

    this.queue.on('task_queued', (taskId) => {
      console.log(`Task queued: ${taskId}`);
      this.queueSize++;
    });

    this.queue.on('task_failed', (taskId, err) => {
      console.error(`Task ${taskId} failed:`, err);
      this.queueSize = Math.max(0, this.queueSize - 1);
    });

    this.queue.on('task_finish', (taskId) => {
      console.log(`Task ${taskId} finished`);
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

  private releaseLock(key: string): void {
    // Release memory lock
    this.locks.delete(key);

    // Release Redis lock if available
    if (redisManager.isAvailable()) {
      redisManager
        .safeExecute((redis) => redis.del(key), 0)
        .catch((err) =>
          console.warn(`Error releasing Redis lock for ${key}:`, err),
        );
    }
  }

  setRequestStatus(
    requestId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    data?: any,
  ): void {
    console.log(`Setting request status for ${requestId} to ${status}`);

    const statusEntry = {
      status,
      completed: status === 'completed',
      data: data || null,
      timestamp: Date.now(),
      error: status === 'failed' && data?.error ? data.error : undefined,
    };

    // Always update memory cache first
    this.requestStatusMap.set(requestId, statusEntry);

    // Try to update Redis but don't wait for it
    if (redisManager.isAvailable()) {
      const redisKey = `request:${requestId}`;
      redisManager
        .safeSet(
          redisKey,
          JSON.stringify(statusEntry),
          3600, // 1 hour TTL
        )
        .catch((err) => {
          console.warn(`Failed to set Redis status for ${requestId}:`, err);
        });
    }
  }

  // Get request status with fallback mechanisms
  async getRequestStatus(requestId: string): Promise<{
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
    completed: boolean;
    data: any;
    error?: string;
  }> {
    // Check memory cache first (fastest)
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

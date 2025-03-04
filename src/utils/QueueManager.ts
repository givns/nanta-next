// utils/QueueManager.ts
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';
import { ProcessingOptions, QueueResult } from '@/types/attendance';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { cacheService } from '../services/cache/CacheService';

// Global reference to the processing function
let processingFunction:
  | ((task: ProcessingOptions) => Promise<QueueResult>)
  | null = null;

export class QueueManager {
  private static instance: QueueManager | null = null;
  private queue!: BetterQueue<ProcessingOptions, QueueResult>;
  public queueSize: number = 0;
  private serviceQueue: ReturnType<typeof getServiceQueue>;

  // In-memory request status cache
  private requestStatusMap = new Map<
    string,
    {
      recoveryAttempted: boolean;
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
    // In the queue worker function
    this.queue = new BetterQueue<ProcessingOptions, QueueResult>(
      async (task, cb) => {
        console.log(`Queue worker starting task ${task.requestId}`);

        // Define these variables for finally block
        let lockAcquired = false;
        const lockKey = `lock:${task.employeeId}`;

        try {
          // Update status to processing immediately
          this.setRequestStatus(task.requestId!, 'processing');

          // Get processing function - either from global ref or use direct import
          const processFn = processingFunction;
          if (!processFn) {
            throw new Error('Processing function not initialized');
          }

          // Add aggressive progress tracking
          const progressLogger = setInterval(() => {
            console.log(
              `[PROGRESS] Task ${task.requestId} still processing...`,
            );
          }, 5000);

          try {
            // CRITICAL CHANGE: Use absolute timeout of 20 seconds for processing
            const processingPromise = processFn(task);

            // Add a safety timeout that will forcibly resolve
            const timeoutPromise = new Promise<QueueResult>((_, reject) => {
              setTimeout(() => {
                const error = new Error(
                  'Queue worker timeout after 20 seconds',
                );
                console.error(
                  `Task ${task.requestId} timed out in queue worker`,
                );

                // Also update status to failed
                this.setRequestStatus(task.requestId!, 'failed', {
                  error: error.message,
                  timestamp: new Date().toISOString(),
                });

                reject(error);
              }, 20000); // 20 second hard timeout (increased from 10)
            });

            // Race between processing and timeout
            const result = await Promise.race([
              processingPromise,
              timeoutPromise,
            ]);

            // If we reach here, processing succeeded
            console.log(`Task ${task.requestId} completed successfully`);
            this.setRequestStatus(task.requestId!, 'completed', result);

            this.queueSize = Math.max(0, this.queueSize - 1);
            clearInterval(progressLogger);
            cb(null, result);
          } catch (error) {
            clearInterval(progressLogger);
            throw error;
          }
        } catch (error) {
          // Improved error handling
          console.error(
            `Queue worker error for task ${task.requestId}:`,
            error,
          );

          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          const isTimeout =
            errorMessage.includes('timeout') ||
            errorMessage.includes('timed out');

          // Update status with proper error details
          this.setRequestStatus(task.requestId!, 'failed', {
            error: isTimeout ? 'Task processing timed out' : errorMessage,
            timestamp: new Date().toISOString(),
          });

          this.queueSize = Math.max(0, this.queueSize - 1);
          cb(error as Error);
        } finally {
          // Cleanup resources if needed
          if (lockAcquired) {
            this.releaseLock(lockKey);
          }
        }
      },
      {
        concurrent: 1,
        maxRetries: 0, // Don't retry failed tasks at all
        maxTimeout: 25000, // 25 seconds max total timeout
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

    // No Redis lock needed, using memory only
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
      recoveryAttempted: false,
    };

    // Always update memory cache first
    this.requestStatusMap.set(requestId, statusEntry);

    try {
      const cacheKey = `request:${requestId}`;
      cacheService
        .set(
          cacheKey,
          JSON.stringify(statusEntry),
          3600, // 1 hour TTL
        )
        .catch((err) => {
          console.warn(`Failed to set cache status for ${requestId}:`, err);
        });
    } catch (error) {
      console.warn(`Error setting cache status for ${requestId}:`, error);
    }
  }

  // Line ~202 in QueueManager.ts
  async getRequestStatus(requestId: string): Promise<{
    recoveryAttempted: boolean;
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
      memoryStatus.recoveryAttempted = false; // Add the missing property 'recoveryAttempted' and assign it a value of 'false'
      return memoryStatus;
    }

    try {
      const cacheKey = `request:${requestId}`;
      const cachedStatus = await cacheService.get(cacheKey);

      if (cachedStatus) {
        try {
          const parsedStatus = JSON.parse(cachedStatus);
          // Cache in memory for faster future access
          this.requestStatusMap.set(requestId, parsedStatus);
          console.log(
            `Found status for ${requestId} in cache: ${parsedStatus.status}`,
          );
          return parsedStatus;
        } catch (parseError) {
          console.error('Error parsing cached status:', parseError);
        }
      }
    } catch (error) {
      console.warn('Cache status lookup failed:', error);
    }

    // NEW: Check if this is a recent request based on the requestId format
    // Most requestIds contain timestamps like: check-1741043424886-625dl2tk4
    try {
      if (requestId.startsWith('check-')) {
        const parts = requestId.split('-');
        if (parts.length >= 2) {
          const timestamp = parseInt(parts[1]);
          const ageMs = Date.now() - timestamp;

          // If request is less than 2 minutes old and we have no status, assume it's still processing
          if (!isNaN(timestamp) && ageMs < 120000) {
            console.log(
              `No status found for recent request ${requestId}, assuming still processing`,
            );
            const processingStatus = {
              status: 'processing' as const,
              completed: false,
              data: null,
              created: Date.now(),
              timestamp,
              recoveryAttempted: false,
            };

            // Store in memory for future lookups
            this.requestStatusMap.set(requestId, processingStatus);

            return processingStatus;
          }
        }
      }
    } catch (e) {
      console.warn('Error parsing requestId timestamp:', e);
    }

    console.log(`No status found for ${requestId}, returning unknown`);
    return {
      status: 'unknown',
      completed: false,
      data: null,
      recoveryAttempted: false,
    };
  }

  // Enqueue task with improved error handling
  async enqueue(task: ProcessingOptions): Promise<QueueResult> {
    if (!task.requestId) {
      task.requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    console.log(`Enqueueing task with requestId ${task.requestId}`);

    // Set initial status - MAKE SURE THIS HAPPENS FIRST
    this.setRequestStatus(task.requestId, 'pending');
    console.log(
      `Status for ${task.requestId} set to 'pending' before queue push`,
    );

    // Verify the status was set correctly - add this debug check
    const statusCheck = this.requestStatusMap.get(task.requestId);
    console.log(`Immediate status check: ${JSON.stringify(statusCheck)}`);

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

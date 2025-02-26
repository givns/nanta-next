// pages/api/attendance/task-status/[requestId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { QueueManager } from '@/utils/QueueManager';
import { PrismaClient } from '@prisma/client';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { getCurrentTime } from '@/utils/dateUtils';
import { createRateLimitMiddleware } from '@/utils/rateLimit';
import { redisManager } from '@/services/RedisConnectionManager';

// Task status interface
interface TaskStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
  completed: boolean;
  data: any;
  error?: string;
  source?: string;
  timestamp: number;
}

// In-memory cache with TTL
const taskStatusCache = new Map<string, TaskStatus>();

// Rate limit middleware - lower limits for status checks
const rateLimitMiddleware = createRateLimitMiddleware(60 * 1000, 20);

// Initialize services
const prisma = new PrismaClient();
const serviceQueue = getServiceQueue(prisma);
const queueManager = QueueManager.getInstance();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only GET method is allowed',
    });
  }

  try {
    // Apply rate limiting
    await rateLimitMiddleware(req);

    const { requestId } = req.query;
    if (!requestId || typeof requestId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Missing or invalid requestId',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    console.log(`[${requestId}] Status check received`);

    // Get status with improved fallbacks
    let statusResult = await getTaskStatusWithFallbacks(requestId);
    const currentTime = Date.now();
    const creationTime = parseTimeFromRequestId(requestId);
    const ageInMs = currentTime - creationTime;

    // Important: Handle stalled tasks - if a task has been "processing" for too long, mark it as failed
    if (statusResult.status === 'processing' && ageInMs > 20000) {
      // 20 seconds max processing time
      console.log(
        `[${requestId}] Task has been processing for too long (${ageInMs}ms), marking as failed`,
      );

      // Update status to failed
      QueueManager.getInstance().setRequestStatus(requestId, 'failed', {
        error: 'Task processing timed out after 20 seconds',
        timestamp: new Date().toISOString(),
      });

      // Update our result
      statusResult = {
        status: 'failed',
        completed: true,
        data: null,
        error: 'Task processing timed out after 20 seconds',
        source: 'timeout_handler',
        timestamp: currentTime,
      };
    }

    // Calculate next poll interval - adaptive based on status and age
    const nextPollInterval = calculatePollInterval(
      statusResult.status,
      ageInMs,
    );

    console.log(
      `[${requestId}] Returning status: ${statusResult.status}, suggesting next poll in ${nextPollInterval}ms`,
    );

    return res.status(200).json({
      ...statusResult,
      timestamp: getCurrentTime().toISOString(),
      nextPollInterval,
      shouldContinuePolling:
        statusResult.status === 'pending' ||
        statusResult.status === 'processing',
      age: ageInMs,
    });
  } catch (error) {
    console.error('Error getting task status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get task status',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: getCurrentTime().toISOString(),
      shouldContinuePolling: false,
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Helper function to extract creation time from requestId format check-{timestamp}-{random}
function parseTimeFromRequestId(requestId: string): number {
  try {
    const parts = requestId.split('-');
    if (parts.length >= 2 && parts[0] === 'check') {
      return parseInt(parts[1], 10);
    }
  } catch (e) {}
  return Date.now() - 30000; // Default to 30 seconds ago if parsing fails
}

// Calculate adaptive poll interval
function calculatePollInterval(status: string, ageInMs: number): number {
  if (status === 'completed' || status === 'failed') {
    return 5000; // No need to poll frequently for completed/failed tasks
  }

  if (status === 'pending') {
    // For pending tasks, shorter intervals at first, then increasing
    return Math.min(800 + Math.floor(ageInMs / 1000) * 300, 2000);
  }

  if (status === 'processing') {
    // For processing tasks, medium intervals
    return Math.min(500 + Math.floor(ageInMs / 1000) * 200, 2000);
  }

  // Unknown status, use conservative interval
  return 2000;
}

/**
 * Get task status using multiple fallback mechanisms in order of speed
 */
async function getTaskStatusWithFallbacks(
  requestId: string,
): Promise<TaskStatus> {
  const trackingId = `status-lookup-${Date.now()}`;
  console.log(`[${trackingId}] Looking up status for ${requestId}`);

  // 1. Try memory cache first (fastest)
  const memoryCached = taskStatusCache.get(requestId);
  if (memoryCached && Date.now() - memoryCached.timestamp < 60000) {
    // 1 minute TTL
    console.log(`[${trackingId}] Memory cache hit for ${requestId}`);
    return {
      ...memoryCached,
      source: 'memory_cache',
    };
  }

  // 2. Try Redis if available
  if (redisManager.isAvailable()) {
    try {
      console.log(`[${trackingId}] Checking Redis for ${requestId}`);
      const redisKey = `request:${requestId}`;
      const redisValue = await redisManager.safeGet(redisKey);

      if (redisValue) {
        try {
          const parsedValue = JSON.parse(redisValue);
          // Store in memory cache for faster future lookups
          taskStatusCache.set(requestId, {
            ...parsedValue,
            timestamp: Date.now(),
          });

          console.log(`[${trackingId}] Redis cache hit for ${requestId}`);
          return {
            ...parsedValue,
            source: 'redis_cache',
          };
        } catch (parseError) {
          console.warn(
            `[${trackingId}] Failed to parse Redis value:`,
            parseError,
          );
        }
      }
    } catch (redisError) {
      console.warn(
        `[${trackingId}] Redis error when fetching status:`,
        redisError,
      );
    }
  }

  // 3. Try QueueManager
  try {
    console.log(`[${trackingId}] Checking QueueManager for ${requestId}`);
    const taskStatus = await queueManager.getRequestStatus(requestId);

    // Cache the result in memory
    taskStatusCache.set(requestId, {
      ...taskStatus,
      timestamp: Date.now(),
    });

    // Set cache expiration (30 minutes)
    setTimeout(
      () => {
        taskStatusCache.delete(requestId);
      },
      30 * 60 * 1000,
    );

    // Also cache in Redis if available
    if (redisManager.isAvailable()) {
      redisManager
        .safeSet(
          `request:${requestId}`,
          JSON.stringify(taskStatus),
          1800, // 30 minutes TTL
        )
        .catch((error) =>
          console.warn(`[${trackingId}] Redis cache set failed:`, error),
        );
    }

    console.log(
      `[${trackingId}] QueueManager hit for ${requestId}: ${taskStatus.status}`,
    );
    return {
      ...taskStatus,
      source: 'queue_manager',
      timestamp: Date.now(), // Add the timestamp property
    };
  } catch (queueError) {
    console.error(
      `[${trackingId}] Error getting task status from queue manager:`,
      queueError,
    );
  }

  // 4. Fallback to recent attendance records lookup
  try {
    console.log(`[${trackingId}] Trying database fallback for ${requestId}`);
    const recentRecords = await findRecentAttendanceRecords();

    if (recentRecords && recentRecords.length > 0) {
      // Use the most recent record
      const record = recentRecords[0];

      // Create a response based on available data
      const statusData: TaskStatus = {
        status: 'completed',
        completed: true,
        data: {
          success: true,
          requestId,
          data: {
            state: {
              current: {
                type: record.type,
                activity: {
                  isActive: !record.CheckOutTime,
                  checkIn: record.CheckInTime?.toISOString() || null,
                  checkOut: record.CheckOutTime?.toISOString() || null,
                },
              },
            },
            validation: {
              allowed: true,
              reason: '',
            },
          },
          status: {
            id: record.id,
            employeeId: record.employeeId,
            CheckInTime: record.CheckInTime?.toISOString() || null,
            CheckOutTime: record.CheckOutTime?.toISOString() || null,
            state: record.state,
            checkStatus: record.checkStatus,
            type: record.type,
            createdAt:
              record.createdAt?.toISOString() || new Date().toISOString(),
          },
          timestamp:
            record.createdAt?.toISOString() || new Date().toISOString(),
        },
        timestamp: Date.now(),
        source: 'recent_records_fallback',
      };

      // Store in memory cache
      taskStatusCache.set(requestId, statusData);

      // Store in Redis cache if available
      if (redisManager.isAvailable()) {
        redisManager
          .safeSet(
            `request:${requestId}`,
            JSON.stringify(statusData),
            1800, // 30 minutes TTL
          )
          .catch((error) =>
            console.warn(`[${trackingId}] Redis cache set failed:`, error),
          );
      }

      console.log(`[${trackingId}] Database fallback success for ${requestId}`);
      return statusData;
    }
  } catch (dbError) {
    console.error(`[${trackingId}] Database fallback error:`, dbError);
  }

  // 5. If all lookups fail, return a reasonable default
  console.log(
    `[${trackingId}] All lookups failed, returning default status for ${requestId}`,
  );
  const defaultStatus: TaskStatus = {
    status: 'pending',
    completed: false,
    data: null,
    error:
      'Status could not be determined, but request is likely still processing',
    timestamp: Date.now(),
    source: 'fallback',
  };

  // Cache this default response briefly to avoid repeated failures
  taskStatusCache.set(requestId, defaultStatus);

  return defaultStatus;
}

/**
 * Helper function to find recent attendance records
 */
async function findRecentAttendanceRecords() {
  // Get very recent attendance records as a fallback
  const cutoffTime = new Date();
  cutoffTime.setMinutes(cutoffTime.getMinutes() - 5); // Last 5 minutes

  // Try to get services (don't rely on this, just to keep it warmed up)
  try {
    await serviceQueue.getInitializedServices();
  } catch (error) {
    console.warn('Failed to get initialized services:', error);
  }

  // Query recent attendance records
  return await prisma.attendance.findMany({
    where: {
      // Only look for checked-in records
      CheckInTime: { not: null },
      // This assumes your model has createdAt - adjust if needed
      createdAt: { gte: cutoffTime },
    },
    orderBy: {
      // This uses createdAt which is more likely to exist than updatedAt
      createdAt: 'desc',
    },
    // Limit to a few records to avoid large result sets
    take: 5,
    // Select only the fields we need
    select: {
      id: true,
      employeeId: true,
      date: true,
      state: true,
      checkStatus: true,
      type: true,
      CheckInTime: true,
      CheckOutTime: true,
      createdAt: true,
    },
  });
}

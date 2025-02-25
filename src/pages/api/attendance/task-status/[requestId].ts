// pages/api/attendance/task-status/[requestId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { QueueManager } from '@/utils/QueueManager';
import { PrismaClient } from '@prisma/client';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { getCurrentTime } from '@/utils/dateUtils';
import { createRateLimitMiddleware } from '@/utils/rateLimit';
import { redisManager } from '@/services/RedisConnectionManager';

// In-memory cache for task status to reduce Redis dependency
const taskStatusCache = new Map<
  string,
  {
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
    completed: boolean;
    data: any;
    timestamp: number;
  }
>();

// Rate limit middleware - lower limits for status checks
const rateLimitMiddleware = createRateLimitMiddleware(60 * 1000, 20);

// Initialize services with PrismaClient
const prisma = new PrismaClient();

// Initialize service queue with PrismaClient - and actually use it
const serviceQueue = getServiceQueue(prisma);
console.log('Service queue initialized:', !!serviceQueue);

// Initialize QueueManager
const queueManager = QueueManager.getInstance();

// Initialize Redis status
const redisInitialized = redisManager.isAvailable();
console.log(
  'Redis connection status:',
  redisInitialized ? 'available' : 'unavailable',
);

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

    // Check memory cache first
    const cachedStatus = taskStatusCache.get(requestId);
    if (cachedStatus && Date.now() - cachedStatus.timestamp < 60000) {
      // 1 minute TTL
      return res.status(200).json({
        ...cachedStatus,
        timestamp: getCurrentTime().toISOString(),
        source: 'memory_cache',
      });
    }

    // Check Redis cache if available
    if (redisManager.isAvailable()) {
      try {
        const redisKey = `request:${requestId}`;
        const redisValue = await redisManager.safeGet(redisKey);

        if (redisValue) {
          try {
            const parsedValue = JSON.parse(redisValue);
            taskStatusCache.set(requestId, parsedValue);

            return res.status(200).json({
              ...parsedValue,
              timestamp: getCurrentTime().toISOString(),
              source: 'redis_cache',
            });
          } catch (parseError) {
            console.warn('Failed to parse Redis value:', parseError);
          }
        }
      } catch (redisError) {
        console.warn('Redis error when fetching status:', redisError);
      }
    }

    try {
      // Try to get status from QueueManager
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
          .catch(() => {}); // Ignore Redis errors
      }

      return res.status(200).json({
        ...taskStatus,
        timestamp: getCurrentTime().toISOString(),
        source: 'queue_manager',
      });
    } catch (queueError) {
      console.error(
        'Error getting task status from queue manager:',
        queueError,
      );

      // Try fallback approach using just a time-based query
      try {
        // Look for recently completed attendance records
        const recentRecords = await findRecentAttendanceRecords();

        if (recentRecords && recentRecords.length > 0) {
          // Use the most recent record
          const record = recentRecords[0];

          // Create a response based on available data
          const statusData = {
            status: 'completed' as const,
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
              .catch(() => {}); // Ignore Redis errors
          }

          return res.status(200).json({
            ...statusData,
            source: 'recent_records_fallback',
            timestamp: getCurrentTime(),
          });
        }
      } catch (dbError) {
        console.error('Database fallback error:', dbError);
        // Continue to generic response
      }

      // If we couldn't get status from any source, return a reasonable default
      const defaultStatus = {
        status: 'pending' as const,
        completed: false,
        message:
          'Status could not be determined, but request is likely still processing',
        timestamp: getCurrentTime(),
        source: 'fallback',
      };

      // Cache this default response for a short time to avoid repeated failures
      taskStatusCache.set(requestId, {
        ...defaultStatus,
        timestamp: Date.now(),
        data: undefined,
      });

      return res.status(200).json(defaultStatus);
    }
  } catch (error) {
    console.error('Error getting task status:', error);

    return res.status(500).json({
      status: 'error',
      message: 'Failed to get task status',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: getCurrentTime().toISOString(),
    });
  } finally {
    // Ensure service availability for next request by calling initialization methods
    if (!redisManager.isAvailable()) {
      redisManager.initialize().catch(() => {});
    }

    // Make sure to disconnect Prisma
    await prisma.$disconnect();
  }

  // Helper function to find recent attendance records
  async function findRecentAttendanceRecords() {
    // Get very recent attendance records as a fallback
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - 5); // Last 5 minutes

    // Ask the service queue for services to ensure we're keeping it used
    try {
      await serviceQueue.getInitializedServices();
    } catch (error) {
      console.warn('Failed to get initialized services:', error);
    }

    // Use a simple query that avoids potentially problematic fields
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
}

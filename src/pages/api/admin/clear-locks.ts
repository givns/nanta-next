// pages/api/admin/clear-locks.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { AttendanceStateManager } from '@/services/Attendance/AttendanceStateManager';
import { getCurrentTime } from '@/utils/dateUtils';
import Redis from 'ioredis';

// Initialize services
const prisma = new PrismaClient();
const serviceQueue = getServiceQueue(prisma);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
    });
  }

  // Add a simple API key check for security
  // In production, you would use a more robust authentication mechanism
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  let redis: Redis | null = null;

  try {
    // Extract employeeId from request if provided for targeted lock clearing
    const { employeeId } = req.body;

    // Get the state manager
    const stateManager = AttendanceStateManager.getInstance();

    // Connect to Redis directly for admin operations
    if (process.env.REDIS_URL) {
      redis = new Redis(process.env.REDIS_URL);
    }

    if (employeeId) {
      // Directly invalidate the state for the employee
      await stateManager.invalidateState(employeeId);

      // Also clear any Redis locks directly if Redis is available
      if (redis) {
        const lockKey = `attendance:lock:${employeeId}`;
        const stateKey = `attendance:state:${employeeId}`;

        // Get lock info before clearing
        const ttl = await redis.ttl(lockKey);
        const exists = await redis.exists(lockKey);

        // Clear both lock and state
        if (exists) {
          await redis.del(lockKey);
        }
        await redis.del(stateKey);

        return res.status(200).json({
          success: true,
          message: `Cleared state and locks for employee ${employeeId}`,
          details: {
            hadLock: exists === 1,
            lockTTL: ttl,
            memoryStateCleared: true,
            redisStateCleared: true,
          },
          timestamp: getCurrentTime().toISOString(),
        });
      } else {
        // Redis not available, only memory was cleared
        return res.status(200).json({
          success: true,
          message: `Cleared memory state for employee ${employeeId}`,
          details: {
            hadLock: false,
            memoryStateCleared: true,
            redisStateCleared: false,
            redisAvailable: false,
          },
          timestamp: getCurrentTime().toISOString(),
        });
      }
    } else {
      // Clear all locks by pattern matching
      if (redis) {
        // Find all lock keys
        const lockKeys = await redis.keys('attendance:lock:*');
        const stateKeys = await redis.keys('attendance:state:*');

        let locksCleared = 0;
        let statesCleared = 0;

        // Clear all locks
        if (lockKeys.length > 0) {
          locksCleared = await redis.del(...lockKeys);
        }

        // Clear all states
        if (stateKeys.length > 0) {
          statesCleared = await redis.del(...stateKeys);
        }

        // Also reset any in-memory states in the state manager
        const memoryClearResult = await stateManager.resetAllStates();

        return res.status(200).json({
          success: true,
          message: `Cleared ${locksCleared} locks and ${statesCleared} states`,
          details: {
            locksCleared,
            statesCleared,
            memoryCacheReset: true,
            attendanceStateManagerReset: memoryClearResult.success,
          },
          timestamp: getCurrentTime().toISOString(),
        });
      } else {
        // Redis not available, only reset memory state
        const memoryClearResult = await stateManager.resetAllStates();

        return res.status(200).json({
          success: true,
          message: 'Cleared in-memory state only (Redis not available)',
          details: {
            memoryCacheReset: true,
            redisAvailable: false,
            attendanceStateManagerReset: memoryClearResult.success,
          },
          timestamp: getCurrentTime().toISOString(),
        });
      }
    }
  } catch (error) {
    console.error('Error clearing locks:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to clear locks',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: getCurrentTime().toISOString(),
    });
  } finally {
    if (redis) {
      await redis.quit();
    }
    await prisma.$disconnect();
  }
}

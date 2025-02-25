// pages/api/admin/clear-locks.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { AttendanceStateManager } from '@/services/Attendance/AttendanceStateManager';
import { getCurrentTime } from '@/utils/dateUtils';

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

  try {
    // Extract employeeId from request if provided for targeted lock clearing
    const { employeeId } = req.body;

    // Get the state manager
    const stateManager = AttendanceStateManager.getInstance();

    let result;
    if (employeeId) {
      // Check for a specific employee's lock
      const lockInfo = await stateManager.checkEmployeeLock(employeeId);

      if (lockInfo.hasLock) {
        // Force invalidate the state
        await stateManager.invalidateState(employeeId);

        result = {
          success: true,
          message: `Cleared lock for employee ${employeeId}`,
          lockInfo,
          timestamp: getCurrentTime().toISOString(),
        };
      } else {
        result = {
          success: true,
          message: `No active lock found for employee ${employeeId}`,
          timestamp: getCurrentTime().toISOString(),
        };
      }
    } else {
      // Clear all stale locks
      const clearedCount = await stateManager.clearStaleLocks();

      result = {
        success: true,
        message: `Cleared ${clearedCount} stale lock(s)`,
        timestamp: getCurrentTime().toISOString(),
      };
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error clearing locks:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to clear locks',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: getCurrentTime().toISOString(),
    });
  } finally {
    await prisma.$disconnect();
  }
}

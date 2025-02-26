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

// pages/api/attendance/task-status/[requestId].ts

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
    const { requestId } = req.query;
    if (!requestId || typeof requestId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Missing or invalid requestId',
        timestamp: getCurrentTime().toISOString(),
      });
    }

    console.log(`[${requestId}] Status check received`);

    // Get status from QueueManager
    const queueManager = QueueManager.getInstance();
    let statusResult = await queueManager.getRequestStatus(requestId);

    // Extract creation time from requestId (format: check-timestamp-hash)
    let creationTime = Date.now() - 30000; // Default to 30s ago
    try {
      const parts = requestId.split('-');
      if (parts.length >= 2 && parts[0] === 'check') {
        creationTime = parseInt(parts[1]);
      }
    } catch (e) {} // Ignore parsing errors

    const ageMs = Date.now() - creationTime;

    // IMPORTANT: Detect stalled tasks (stuck in processing)
    if (statusResult.status === 'processing' && ageMs > 15000) {
      console.log(
        `[${requestId}] Task has been processing for ${ageMs}ms, marking as failed`,
      );

      // Update status to failed for stalled tasks
      queueManager.setRequestStatus(requestId, 'failed', {
        error: 'Task processing stalled',
        timestamp: new Date().toISOString(),
      });

      statusResult = {
        status: 'failed',
        completed: true,
        data: null,
        error: 'Task processing stalled',
      };
    }

    // Calculate appropriate polling interval
    const nextPollInterval = getPollingInterval(statusResult.status, ageMs);

    return res.status(200).json({
      ...statusResult,
      age: ageMs,
      nextPollInterval,
      shouldContinuePolling: ['pending', 'processing'].includes(
        statusResult.status,
      ),
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error) {
    console.error('Error getting task status:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to get task status',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: getCurrentTime().toISOString(),
      shouldContinuePolling: false,
      nextPollInterval: 5000,
    });
  }
}

// Helper to calculate adaptive polling intervals
function getPollingInterval(status: string, ageMs: number): number {
  if (status === 'pending') {
    // For pending tasks, start with 800ms, increase gradually
    return Math.min(800 + Math.floor(ageMs / 1000) * 200, 2000);
  }
  if (status === 'processing') {
    // For processing tasks, start with 1500ms
    return Math.min(1500 + Math.floor(ageMs / 3000) * 200, 2000);
  }
  // For completed/failed, longer interval
  return 2000;
}

// pages/api/attendance/task-status/[requestId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { QueueManager } from '@/utils/QueueManager';
import { PrismaClient } from '@prisma/client';
import { getServiceQueue } from '@/utils/ServiceInitializationQueue';
import { getCurrentTime } from '@/utils/dateUtils';
import { createRateLimitMiddleware } from '@/utils/rateLimit';

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

// Initialize Prisma client - outside the handler to be shared across requests
const prisma = new PrismaClient();

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

    // Extract creation time from requestId (format: check-timestamp-hash)
    let creationTime = Date.now() - 30000; // Default to 30s ago
    try {
      const parts = requestId.split('-');
      if (parts.length >= 2 && parts[0] === 'check') {
        creationTime = parseInt(parts[1]);
      }
    } catch (e) {} // Ignore parsing errors

    const ageMs = Date.now() - creationTime;

    try {
      // Initialize queue manager - CRITICAL: Pass the prisma instance
      const serviceQueue = getServiceQueue(prisma);
      const queueManager = QueueManager.getInstance();

      // Get status from QueueManager first (this is the source of truth)
      let statusResult = await queueManager.getRequestStatus(requestId);

      // CRITICAL: Update memory cache to match the queue status if needed
      // This ensures memory cache doesn't serve stale data
      const cached = taskStatusCache.get(requestId);
      if (cached && cached.status !== statusResult.status) {
        console.log(
          `[${requestId}] Updating memory cache from ${cached.status} to ${statusResult.status}`,
        );
        taskStatusCache.set(requestId, {
          ...statusResult,
          timestamp: Date.now(),
        });
      }

      // IMPORTANT: Detect stalled tasks with increased timeout
      if (statusResult.status === 'processing' && ageMs > 15000) {
        console.log(
          `[${requestId}] Task has been processing for ${ageMs}ms, marking as failed`,
        );

        // Update status to failed for stalled tasks
        queueManager.setRequestStatus(requestId, 'failed', {
          error: 'Task processing stalled',
          timestamp: new Date().toISOString(),
        });

        // IMPORTANT: Make sure we're using the updated status in the response
        statusResult = {
          status: 'failed',
          completed: true,
          data: null,
          error: 'Task processing stalled',
        };

        // Also update memory cache to ensure consistency
        taskStatusCache.set(requestId, {
          ...statusResult,
          timestamp: Date.now(),
        });
      }

      // Always update cache for completed or failed statuses
      if (
        statusResult.status === 'completed' ||
        statusResult.status === 'failed'
      ) {
        taskStatusCache.set(requestId, {
          ...statusResult,
          timestamp: Date.now(),
        });
      }

      // Calculate appropriate polling interval
      const nextPollInterval = getPollingInterval(statusResult.status, ageMs);

      return res.status(200).json({
        ...statusResult,
        age: ageMs,
        nextPollInterval,
        // Ensure shouldContinuePolling is consistent with the status
        shouldContinuePolling:
          (statusResult.status === 'pending' ||
            statusResult.status === 'processing') &&
          ageMs < 15000, // Never poll for more than 15 seconds
        timestamp: getCurrentTime().toISOString(),
      });
    } catch (initError) {
      console.error('Error initializing service queue:', initError);

      // If we have a cached status for this requestId, use it as a fallback
      const cached = taskStatusCache.get(requestId);
      if (cached) {
        return res.status(200).json({
          ...cached,
          age: ageMs,
          nextPollInterval: 2000,
          shouldContinuePolling: false, // Important: stop polling on initialization errors
          timestamp: getCurrentTime().toISOString(),
          initializationError: true, // Add a flag to indicate this came from cache due to init error
        });
      }

      throw initError; // Re-throw if no cache available
    }
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

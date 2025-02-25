// pages/api/attendance/task-status/[requestId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { QueueManager } from '@/utils/QueueManager';
import { getCurrentTime } from '@/utils/dateUtils';
import { createRateLimitMiddleware } from '@/utils/rateLimit';

// Rate limit middleware - lower limits for status checks
const rateLimitMiddleware = createRateLimitMiddleware(60 * 1000, 20);

// Get the queue manager instance
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

    // Get task status from queue manager
    const taskStatus = await queueManager.getRequestStatus(requestId);

    return res.status(200).json({
      status: taskStatus.status,
      completed: taskStatus.completed,
      data: taskStatus.data,
      timestamp: getCurrentTime().toISOString(),
    });
  } catch (error) {
    console.error('Error getting task status:', error);

    return res.status(500).json({
      status: 'error',
      message: 'Failed to get task status',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: getCurrentTime().toISOString(),
    });
  }
}

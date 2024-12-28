import { NextApiRequest, NextApiResponse } from 'next';
import { cacheService } from '../../services/cache/CacheService';
import { format } from 'date-fns';
import { getCurrentTime } from '@/utils/dateUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employeeId } = req.body;

  if (!employeeId) {
    return res.status(400).json({ error: 'Employee ID is required' });
  }

  try {
    const date = format(getCurrentTime(), 'yyyy-MM-dd');
    // Clear all possible cache types for this employee
    const cacheKeys = [
      `attendance:${employeeId}:${date}`,
      `window:${employeeId}:${date}`,
      `validation:${employeeId}:${date}`,
    ];

    await Promise.all(cacheKeys.map((key) => cacheService.del(key)));

    return res.status(200).json({
      message: 'Cache cleared successfully',
      clearedKeys: cacheKeys,
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return res.status(500).json({
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

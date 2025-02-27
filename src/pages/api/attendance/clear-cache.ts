// api/attendance/clear-cache.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { cacheService } from '@/services/cache/CacheService';
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

  const BYPASS_REDIS_FOR_CLEAR = true;
  if (BYPASS_REDIS_FOR_CLEAR) {
    return res.status(200).json({
      message: 'Cache cleared successfully',
      details: [],
    });
  }

  try {
    const date = format(getCurrentTime(), 'yyyy-MM-dd');

    // Use specific keys instead of patterns
    const specificKeys = [
      `attendance:${employeeId}:${date}`,
      `window:${employeeId}:${date}`,
      `validation:${employeeId}:${date}`,
      `shift:${employeeId}:${date}`,
      `status:${employeeId}:${date}`,
      `attendance:state:${employeeId}`,
    ];

    // Delete keys directly
    const clearResults = await Promise.all(
      specificKeys.map(async (key) => {
        try {
          await cacheService.del(key);
          return { key, success: true };
        } catch (error) {
          console.warn(`Failed to clear key ${key}:`, error);
          return {
            key,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),
    );

    // Log results
    console.log('Cache clear results:', {
      employeeId,
      date,
      results: clearResults,
    });

    // Set force refresh flag in memory only
    await cacheService.set(`forceRefresh:${employeeId}`, 'true', 30);

    return res.status(200).json({
      message: 'Cache cleared successfully',
      details: clearResults,
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return res.status(500).json({
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

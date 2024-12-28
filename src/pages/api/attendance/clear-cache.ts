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

  try {
    const date = format(getCurrentTime(), 'yyyy-MM-dd');
    const patterns = [
      // Pattern for all employee's attendance data
      `*:${employeeId}:*`,
      // Specific date patterns
      `attendance:${employeeId}:${date}`,
      `window:${employeeId}:${date}`,
      `validation:${employeeId}:${date}`,
      // Additional patterns for related data
      `shift:${employeeId}:*`,
      `status:${employeeId}:*`,
    ];

    const clearResults = await Promise.all(
      patterns.map(async (pattern) => {
        try {
          await cacheService.invalidatePattern(pattern);
          return { pattern, success: true };
        } catch (error) {
          console.warn(`Failed to clear pattern ${pattern}:`, error);
          return {
            pattern,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      }),
    );

    // Log cleared patterns for debugging
    console.log('Cache clear results:', {
      employeeId,
      date,
      results: clearResults,
    });

    // Add force refresh flag to memory cache
    cacheService.set(`forceRefresh:${employeeId}`, 'true', 30); // 30 seconds TTL

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

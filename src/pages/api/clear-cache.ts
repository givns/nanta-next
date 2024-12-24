import { NextApiRequest, NextApiResponse } from 'next';
import { cacheService } from '../../services/cache/CacheService';

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
    const cacheKey = `attendance:status:${employeeId}`;
    await cacheService.del(cacheKey);

    return res.status(200).json({
      message: 'Cache cleared successfully',
      clearedKey: cacheKey,
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    return res.status(500).json({
      error: 'Failed to clear cache',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

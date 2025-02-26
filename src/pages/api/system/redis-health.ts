// pages/api/system/redis-health.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { redisManager } from '@/services/RedisConnectionManager';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Redis if it hasn't been initialized yet
    if (!redisManager.isAvailable()) {
      await redisManager.initialize();
    }

    // Check connection
    const connectionStatus = await redisManager.checkConnection();

    // Get connection details if available
    let clientInfo = null;
    if (connectionStatus.isConnected) {
      try {
        const client = redisManager.getClient();
        if (client) {
          const info = await client.info();
          clientInfo = {
            connectionDetails: client.options,
            serverInfo: info,
          };
        }
      } catch (error) {
        console.error('Failed to get Redis info:', error);
      }
    }

    return res.status(200).json({
      status: connectionStatus.isConnected ? 'connected' : 'disconnected',
      details: connectionStatus,
      clientInfo,
    });
  } catch (error) {
    console.error('Redis health check failed:', error);
    return res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

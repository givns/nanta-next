// pages/api/admin/reset-connections.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { ServiceLifecycle } from '../../../utils/ServiceLifecycle';

/**
 * This is an admin-only endpoint that can be used to reset all Redis connections
 * when the server runs into connection limit issues.
 *
 * IMPORTANT: This endpoint should be protected with proper authentication in production.
 */
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

  // IMPORTANT: In production, add proper authentication here
  // This is a simple API key check for demonstration purposes
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  try {
    // Reset all connections
    await ServiceLifecycle.resetAllConnections();

    return res.status(200).json({
      success: true,
      message: 'All connections reset successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error resetting connections:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to reset connections',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
}

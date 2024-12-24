// pages/api/admin/leave-settings.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { cacheService } from '../../../../services/cache/CacheService';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'];

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    try {
      // First verify the user has permission
      const user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const settings = await prisma.leaveSettings.findFirst({
        orderBy: { updatedAt: 'desc' },
      });

      if (!settings) {
        // Return default settings if none exist
        const defaultSettings = await prisma.leaveSettings.create({
          data: {
            updatedBy: 'system',
          },
        });
        return res.status(200).json(defaultSettings);
      }

      return res.status(200).json(settings);
    } catch (error) {
      console.error('Error fetching leave settings:', error);
      return res.status(500).json({ error: 'Failed to fetch leave settings' });
    }
  }

  if (req.method === 'POST') {
    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const settings = await prisma.leaveSettings.create({
        data: {
          ...req.body,
          updatedBy: user.id,
        },
      });

      // Invalidate any cached settings
      if (cacheService) {
        await cacheService.invalidatePattern('leave-settings:*');
      }

      return res.status(200).json(settings);
    } catch (error) {
      console.error('Error updating leave settings:', error);
      return res.status(500).json({ error: 'Failed to update leave settings' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

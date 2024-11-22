//api/user-data.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { UserDataSchema } from '../../schemas/attendance';
import { cacheService } from '@/services/CacheService';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'] as string;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const cacheKey = `user:${lineUserId}`;
    let userData = null;
    if (cacheService) {
      userData = await cacheService.get(cacheKey);
    }

    if (!userData) {
      const user = await prisma.user.findUnique({
        where: { lineUserId },
        include: { department: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      userData = UserDataSchema.parse(user);
      if (cacheService) {
        await cacheService.set(cacheKey, JSON.stringify(userData), 3600); // Cache for 1 hour
      }
    } else {
      userData = JSON.parse(userData);
    }
    console.log('User data:', userData);

    return res.status(200).json({ user: userData });
  } catch (error) {
    console.error('Error fetching user data:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

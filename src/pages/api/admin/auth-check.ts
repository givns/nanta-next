// pages/api/admin/auth-check.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isAuthorized = ['Admin', 'SuperAdmin'].includes(user.role);
    return res.status(200).json({ isAuthorized });
  } catch (error) {
    console.error('Error checking authorization:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

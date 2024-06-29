// pages/api/check-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(400).json({ message: 'Invalid lineUserId' });
  }

  try {
    console.log(`Fetching user for lineUserId: ${lineUserId}`);

    await prisma.$connect();
    console.log('Database connection successful');

    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      console.log(`User not found for lineUserId: ${lineUserId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`User found: ${JSON.stringify(user)}`);

    const latestCheckIn = await prisma.checkIn.findFirst({
      where: {
        userId: user.id,
        checkOutTime: null,
      },
      orderBy: { checkInTime: 'desc' },
    });

    const status = latestCheckIn ? 'checkout' : 'checkin';
    const checkInId = latestCheckIn ? latestCheckIn.id : null;

    res.status(200).json({
      status,
      checkInId,
      userData: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
      },
    });
  } catch (error: any) {
    console.error('Error in check-status API:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  } finally {
    await prisma.$disconnect();
  }
}

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
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      console.log(`User not found for lineUserId: ${lineUserId}`);
      return res.status(404).json({ message: 'User not found' });
    }

    console.log(`User found: ${JSON.stringify(user)}`);

    console.log(`Fetching latest check-in for userId: ${user.id}`);
    const latestCheckIn = await prisma.checkIn.findFirst({
      where: {
        userId: user.id,
        checkOutTime: null,
      },
      orderBy: { checkInTime: 'desc' },
    });

    const status = latestCheckIn ? 'checkout' : 'checkin';
    const checkInId = latestCheckIn ? latestCheckIn.id : null;

    console.log(`Sending response: status=${status}, checkInId=${checkInId}`);
    res.status(200).json({
      status,
      checkInId,
      userData: user,
    });
  } catch (error: any) {
    console.error('Error in check-status API:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

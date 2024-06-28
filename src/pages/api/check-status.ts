import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res.status(400).json({ error: 'Invalid lineUserId' });
  }

  try {
    // Get the start of the current day
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check for an open check-in (no check-out) for the current day
    const openCheckIn = await prisma.checkIn.findFirst({
      where: {
        user: { lineUserId },
        timestamp: { gte: today },
        checkOutTime: null, // Using checkOutTime instead of checkOutTimestamp
      },
      orderBy: { timestamp: 'desc' },
    });

    if (openCheckIn) {
      // User has an open check-in, should proceed to check-out
      res.status(200).json({ status: 'checkout', checkInId: openCheckIn.id });
    } else {
      // No open check-in, user should check in
      res.status(200).json({ status: 'checkin' });
    }
  } catch (error: unknown) {
    console.error('Error in check-status API:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Internal server error',
        details: error.message,
      });
    } else {
      res.status(500).json({
        error: 'Internal server error',
        details: 'An unknown error occurred',
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

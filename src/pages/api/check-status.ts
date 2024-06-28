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
    const latestCheckIn = await prisma.checkIn.findFirst({
      where: { user: { lineUserId } },
      orderBy: { timestamp: 'desc' },
      include: { user: true },
    });

    if (latestCheckIn) {
      // Handle potential null address
      latestCheckIn.address = latestCheckIn.address || 'Unknown';
    }

    res.status(200).json({ latestCheckIn });
  } catch (error: unknown) {
    console.error('Error in check-status API:', error);

    if (error instanceof Error) {
      res.status(500).json({
        error: 'Internal server error',
        details: error.message,
        stack: error.stack,
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

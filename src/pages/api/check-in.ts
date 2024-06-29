import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { userId, location, address, reason, photo, timestamp } = req.body;

  try {
    // Parse the timestamp (which should be in Thai time) and convert to UTC
    const thaiTime = new Date(timestamp);
    const utcTime = new Date(thaiTime.getTime() - 7 * 60 * 60 * 1000); // Convert Thai time to UTC

    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        location: location, // This will be stored as Json
        address,
        reason: reason || null,
        photo,
        checkInTime: utcTime,
      },
    });

    res.status(200).json({ message: 'Check-in successful', data: checkIn });
  } catch (error: any) {
    console.error('Error during check-in:', error);
    res
      .status(500)
      .json({ message: 'Error processing check-in', error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

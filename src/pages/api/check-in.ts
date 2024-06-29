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
    // Parse the timestamp (which is already in Thai time)
    const checkInTime = new Date(timestamp);
    if (isNaN(checkInTime.getTime())) {
      throw new Error('Invalid timestamp provided');
    }

    const checkIn = await prisma.checkIn.create({
      data: {
        userId,
        location: JSON.stringify(location), // Assuming location is an object
        address,
        reason: reason || null,
        photo,
        checkInTime, // Use the parsed Date object
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

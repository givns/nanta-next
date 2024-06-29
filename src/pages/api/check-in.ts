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
    const checkIn = await prisma.checkIn.create({
      data: {
        user: {
          connect: { id: userId },
        },
        location: location, // Ensure this is a JSON object
        address,
        reason,
        photo,
        checkInTime: new Date(timestamp),
      },
    });

    res.status(200).json({ message: 'Check-in successful', data: checkIn });
  } catch (error) {
    console.error('Error during check-in:', error);
    res.status(500).json({ message: 'Error processing check-in' });
  } finally {
    await prisma.$disconnect();
  }
}

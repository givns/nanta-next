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

  const { checkInId, address, reason, photo, timestamp } = req.body;

  try {
    const updatedCheckIn = await prisma.checkIn.update({
      where: { id: checkInId },
      data: {
        checkOutTime: new Date(timestamp),
        checkOutAddress: address,
        checkOutReason: reason,
        checkOutPhoto: photo,
      },
    });

    res
      .status(200)
      .json({ message: 'Check-out successful', data: updatedCheckIn });
  } catch (error) {
    console.error('Error during check-out:', error);
    res.status(500).json({ message: 'Error processing check-out' });
  } finally {
    await prisma.$disconnect();
  }
}

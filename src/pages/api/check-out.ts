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

  const { checkInId, lineUserId, location, address, photo, checkOutTime } =
    req.body;

  try {
    const updatedCheckIn = await prisma.checkIn.update({
      where: { id: checkInId },
      data: {
        checkOutTime: new Date(checkOutTime),
        // You might want to add additional fields here, like check-out location
      },
    });

    res
      .status(200)
      .json({ message: 'Check-out successful', data: updatedCheckIn });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ message: 'Error processing check-out' });
  } finally {
    await prisma.$disconnect();
  }
}

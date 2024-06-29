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
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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
        id: user.id,
        lineUserId: user.lineUserId,
        name: user.name,
        nickname: user.nickname,
        department: user.department,
        employeeNumber: user.employeeNumber,
        profilePictureUrl: user.profilePictureUrl,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error checking user status:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    await prisma.$disconnect();
  }
}

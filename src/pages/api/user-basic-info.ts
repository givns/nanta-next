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
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: {
        employeeId: true,
        name: true,
        role: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const latestAttendance = await prisma.attendance.findFirst({
      where: { employeeId: user.employeeId },
      orderBy: { date: 'desc' },
      select: {
        checkInTime: true,
        checkOutTime: true,
      },
    });

    const basicData = {
      user: {
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
      },
      attendanceStatus: {
        isCheckingIn:
          !latestAttendance?.checkInTime ||
          (latestAttendance.checkInTime && latestAttendance.checkOutTime),
      },
    };

    res.status(200).json(basicData);
  } catch (error) {
    console.error('Error fetching basic user info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

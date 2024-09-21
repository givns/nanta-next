// In the API route handler (e.g., pages/api/user-basic-info.ts)
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { lineUserId } = req.query;

  if (typeof lineUserId !== 'string') {
    return res.status(400).json({ error: 'Invalid lineUserId' });
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
    });

    const isCheckingIn = latestAttendance
      ? !latestAttendance.checkOutTime
      : true;

    res.json({
      user: {
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
      },
      attendanceStatus: {
        isCheckingIn,
      },
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

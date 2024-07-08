// src/pages/api/users.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        assignedShift: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const recentAttendance = await prisma.attendance.findMany({
      where: {
        userId: user.id,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      orderBy: { date: 'desc' },
      take: 5,
    });

    const totalWorkingDays = await prisma.attendance.count({
      where: {
        userId: user.id,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    const totalPresent = await prisma.attendance.count({
      where: {
        userId: user.id,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
        checkInTime: {
          not: null,
        },
      },
    });

    const totalAbsent = totalWorkingDays - totalPresent;
    const overtimeHours = user.overtimeHours || 0;
    const balanceLeave = 10; // Placeholder value, replace with actual calculation

    const responseData = {
      user,
      recentAttendance,
      totalWorkingDays,
      totalPresent,
      totalAbsent,
      overtimeHours,
      balanceLeave,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

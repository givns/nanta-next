// pages/api/users.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { lineUserId } = req.query;

  if (!lineUserId) {
    return res.status(400).json({ error: 'Missing lineUserId parameter' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId: lineUserId as string },
      include: {
        assignedShift: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch recent attendance records
    const recentAttendance = await prisma.attendance.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
      take: 5, // Fetch the 5 most recent records
    });

    // Fetch leave balance (you'll need to implement this based on your leave tracking system)
    const leaveBalance = await getLeaveBalance(user.id);

    const response = {
      ...user,
      recentAttendance,
      leaveBalance,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// You'll need to implement this function based on your leave tracking system
async function getLeaveBalance(userId: string) {
  // Placeholder implementation
  return {
    annual: 10,
    sick: 5,
    personal: 3,
  };
}

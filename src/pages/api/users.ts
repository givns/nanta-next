import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Received request to /api/users');
  const { lineUserId } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    console.log('Missing or invalid lineUserId:', lineUserId);
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
  }

  console.log('Fetching user data for lineUserId:', lineUserId);

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: {
        assignedShift: true,
      },
    });

    if (!user) {
      console.log('User not found for lineUserId:', lineUserId);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User found:', user.id);

    if (!user.employeeId) {
      console.log('Employee ID not found for user:', user.id);
      return res
        .status(400)
        .json({ error: 'Employee ID not found. Please contact support.' });
    }

    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    console.log('Fetching attendance data for user:', user.id);

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
        checkInTime: { not: null },
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
    console.log('User data being sent:', JSON.stringify(responseData, null, 2));

    console.log('Sending response for user:', user.id);
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

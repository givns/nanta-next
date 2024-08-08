// pages/api/check-in-data.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import moment from 'moment-timezone';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ error: 'Valid Employee ID is required' });
  }

  try {
    const today = moment().tz('Asia/Bangkok');
    const twoDaysAgo = moment(today).subtract(2, 'days').startOf('day');

    const latestAttendance = await prisma.processedAttendance.findFirst({
      where: {
        employeeId,
        date: { gte: twoDaysAgo.toDate() },
      },
      orderBy: { date: 'desc' },
    });

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true, department: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      user: {
        employeeId: user.employeeId,
        name: user.name,
        department: user.department.name,
        assignedShift: user.assignedShift,
      },
      latestAttendance,
    });
  } catch (error) {
    console.error('Error fetching check-in data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

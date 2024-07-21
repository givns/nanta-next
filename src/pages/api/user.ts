// pages/api/user.ts

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
    return res.status(400).json({ message: 'Invalid LINE User ID' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: {
        id: true,
        lineUserId: true,
        name: true,
        employeeId: true,
        role: true,
        sickLeaveBalance: true,
        businessLeaveBalance: true,
        annualLeaveBalance: true,
        overtimeLeaveBalance: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user data' });
  }
}

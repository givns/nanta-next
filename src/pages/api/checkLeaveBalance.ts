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

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        sickLeaveBalance: true,
        businessLeaveBalance: true,
        annualLeaveBalance: true,
        overtimeLeaveBalance: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const totalLeaveDays =
      user.sickLeaveBalance +
      user.businessLeaveBalance +
      user.annualLeaveBalance +
      user.overtimeLeaveBalance;

    res.status(200).json({
      sickLeave: user.sickLeaveBalance,
      businessLeave: user.businessLeaveBalance,
      annualLeave: user.annualLeaveBalance,
      overtimeLeave: user.overtimeLeaveBalance,
      totalLeaveDays,
    });
  } catch (error) {
    console.error('Error fetching leave balance:', error);
    res.status(500).json({ message: 'Error fetching leave balance' });
  }
}

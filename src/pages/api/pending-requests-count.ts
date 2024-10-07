import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const now = new Date();
  const currentMonthStart =
    now.getDate() < 26
      ? new Date(now.getFullYear(), now.getMonth() - 1, 26)
      : new Date(now.getFullYear(), now.getMonth(), 26);

  const [leaveRequests, overtimeRequests] = await Promise.all([
    prisma.leaveRequest.count({
      where: {
        createdAt: { gte: currentMonthStart },
        status: 'PENDING',
      },
    }),
    prisma.overtimeRequest.count({
      where: {
        createdAt: { gte: currentMonthStart },
        status: 'PENDING',
      },
    }),
  ]);

  const count = leaveRequests + overtimeRequests;
  res.status(200).json({ count });
}

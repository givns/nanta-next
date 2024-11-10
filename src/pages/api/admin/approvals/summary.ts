// pages/api/admin/approvals/summary.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;

  if (!lineUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get pending leave requests
    const pendingLeaves = await prisma.leaveRequest.count({
      where: {
        status: 'Pending',
      },
    });

    // Get overtime requests pending admin approval
    const pendingOvertime = await prisma.overtimeRequest.count({
      where: {
        status: 'pending',
        employeeResponse: 'approve',
      },
    });

    // Get urgent requests (resubmitted leaves or day-off overtime)
    const urgentCount = await prisma
      .$transaction([
        prisma.leaveRequest.count({
          where: {
            status: 'Pending',
            resubmitted: true,
          },
        }),
        prisma.overtimeRequest.count({
          where: {
            status: 'pending',
            employeeResponse: 'approve',
            isDayOffOvertime: true,
          },
        }),
      ])
      .then(([urgentLeaves, urgentOvertime]) => urgentLeaves + urgentOvertime);

    const summaryData = {
      leaves: pendingLeaves,
      overtime: pendingOvertime,
      urgent: urgentCount,
      total: pendingLeaves + pendingOvertime,
    };

    return res.status(200).json(summaryData);
  } catch (error) {
    console.error('Error fetching summary data:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

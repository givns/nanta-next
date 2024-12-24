// pages/api/admin/attendance/overtime-requests.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { method } = req;
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

    switch (method) {
      case 'GET': {
        const requestedStatus = req.query.status as string;
        let whereClause: any = {};

        // Build where clause based on requested status
        switch (requestedStatus) {
          case 'pending_response':
            whereClause.status = 'pending_response';
            break;
          case 'approved':
            whereClause = {
              AND: [{ status: 'approved' }, { employeeResponse: 'approve' }],
            };
            break;
          case 'rejected':
            whereClause.status = 'rejected';
            break;
          default:
            // If no status specified, show all
            whereClause = {
              OR: [
                { status: 'pending_response' },
                {
                  AND: [
                    { status: 'approved' },
                    { employeeResponse: 'approve' },
                  ],
                },
                { status: 'rejected' },
              ],
            };
        }

        const requests = await prisma.overtimeRequest.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                name: true,
                departmentName: true,
                employeeId: true,
              },
            },
          },
          orderBy: [{ date: 'asc' }, { createdAt: 'desc' }],
        });

        return res.status(200).json(requests);
      }

      default:
        res.setHeader('Allow', ['GET']);
        return res
          .status(405)
          .json({ message: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Error processing overtime request:', error);
    return res.status(500).json({ message: 'Internal server error', error });
  }
}

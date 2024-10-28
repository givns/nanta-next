// pages/api/admin/attendance/shifts.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true },
    });

    if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    switch (req.method) {
      case 'GET': {
        const { startDate, endDate, department } = req.query;

        const shiftAdjustments = await prisma.shiftAdjustmentRequest.findMany({
          where: {
            date: {
              gte: startDate ? new Date(startDate as string) : undefined,
              lte: endDate ? new Date(endDate as string) : undefined,
            },
            user: department
              ? { departmentName: department as string }
              : undefined,
          },
          include: {
            user: {
              select: {
                name: true,
                employeeId: true,
                departmentName: true,
              },
            },
            requestedShift: true,
          },
          orderBy: {
            date: 'desc',
          },
        });

        return res.status(200).json(shiftAdjustments);
      }

      case 'POST': {
        const { employeeIds, startDate, shiftId, reason } = req.body;

        const adjustments = await Promise.all(
          employeeIds.map(async (employeeId: string) => {
            return prisma.shiftAdjustmentRequest.create({
              data: {
                employeeId,
                date: new Date(startDate),
                requestedShiftId: shiftId,
                reason,
                status: 'approved',
              },
            });
          }),
        );

        return res.status(201).json(adjustments);
      }

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res
          .status(405)
          .json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('Error in shift adjustments API:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// pages/api/admin/shifts/bulk-adjust.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { departmentId, shiftId, date, reason } = req.body;

  try {
    // Get all employees in the department
    const employees = await prisma.user.findMany({
      where: { departmentId },
      select: { id: true },
    });

    // Create adjustment requests for all employees
    const adjustments = await prisma.$transaction(
      employees.map((employee) =>
        prisma.shiftAdjustmentRequest.create({
          data: {
            employeeId: employee.id,
            requestedShiftId: shiftId,
            date: new Date(date),
            reason,
            status: 'pending',
          },
        }),
      ),
    );

    return res.status(200).json(adjustments);
  } catch (error) {
    console.error('Error creating bulk adjustments:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

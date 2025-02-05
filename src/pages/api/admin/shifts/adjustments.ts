// pages/api/admin/shifts/adjustments.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!req.headers['x-line-userid']) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    switch (req.method) {
      case 'GET': {
        const { startDate, endDate, departmentName } = req.query;

        const where: any = {};

        if (startDate && endDate) {
          where.date = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          };
        }

        if (departmentName && departmentName !== 'all') {
          where.user = {
            departmentName: departmentName,
          };
        }

        const adjustments = await prisma.shiftAdjustmentRequest.findMany({
          where,
          include: {
            user: {
              select: {
                employeeId: true,
                name: true,
                departmentName: true,
                assignedShift: true,
              },
            },
            requestedShift: true,
          },
          orderBy: {
            date: 'desc',
          },
        });

        return res.status(200).json(adjustments);
      }

      case 'POST': {
        const { type, employees, departmentName, shiftCode, date, reason } =
          req.body;

        // Find the shift
        const shift = await prisma.shift.findUnique({
          where: { shiftCode },
        });

        if (!shift) {
          return res.status(404).json({ message: 'Shift not found' });
        }

        let targetEmployees;

        if (type === 'department') {
          // Get all employees in department
          targetEmployees = await prisma.user.findMany({
            where: { departmentName },
            select: { employeeId: true },
          });
        } else {
          // Individual employees
          targetEmployees = employees.map((empId: string) => ({
            employeeId: empId,
          }));
        }

        // Create adjustments for all target employees
        const adjustments = await prisma.$transaction(
          targetEmployees.map((emp: { employeeId: string }) =>
            prisma.shiftAdjustmentRequest.create({
              data: {
                employeeId: emp.employeeId,
                requestedShiftId: shift.id,
                date: new Date(date),
                reason,
                status: 'pending',
              },
            }),
          ),
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
    console.error('Error in shift adjustments:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

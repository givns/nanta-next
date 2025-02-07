// pages/api/admin/shifts/adjustments.ts
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
    // Verify admin access
    const adminUser = await prisma.user.findUnique({
      where: { lineUserId },
      select: {
        id: true,
        employeeId: true,
        name: true,
        role: true,
      },
    });

    if (!adminUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!['Admin', 'SuperAdmin'].includes(adminUser.role)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    switch (method) {
      case 'POST': {
        const { type, employeeIds, departmentId, shiftCode, date, reason } =
          req.body;

        // Find the requested shift by shiftCode
        const requestedShift = await prisma.shift.findUnique({
          where: { shiftCode },
        });

        if (!requestedShift) {
          return res.status(404).json({ message: 'Shift not found' });
        }

        // Helper function to create a single adjustment
        const createAdjustment = async (employeeId: string) => {
          // Verify employee exists
          const employee = await prisma.user.findUnique({
            where: { employeeId },
          });

          if (!employee) {
            throw new Error(`Employee with ID ${employeeId} not found`);
          }

          return prisma.shiftAdjustmentRequest.create({
            data: {
              employeeId,
              requestedShiftId: requestedShift.id,
              date: new Date(date),
              reason,
              status: 'pending',
            },
            include: {
              user: {
                select: {
                  name: true,
                  employeeId: true,
                  departmentName: true,
                  assignedShift: true,
                },
              },
              requestedShift: true,
            },
          });
        };

        let adjustments;

        if (type === 'department') {
          // Get all employees in department
          const employees = await prisma.user.findMany({
            where: { departmentId },
            select: { employeeId: true },
          });

          if (employees.length === 0) {
            return res
              .status(404)
              .json({ message: 'No employees found in department' });
          }

          adjustments = await Promise.all(
            employees.map((emp) => createAdjustment(emp.employeeId)),
          );
        } else {
          if (!Array.isArray(employeeIds)) {
            return res
              .status(400)
              .json({ message: 'employeeIds must be an array' });
          }

          adjustments = await Promise.all(
            employeeIds.map((employeeId) => createAdjustment(employeeId)),
          );
        }

        return res.status(201).json(adjustments);
      }

      case 'GET': {
        const { startDate, endDate, departmentId } = req.query;

        const where: any = {};

        if (startDate && endDate) {
          where.date = {
            gte: new Date(startDate as string),
            lte: new Date(endDate as string),
          };
        }

        if (departmentId) {
          where.user = {
            departmentId: departmentId as string,
          };
        }

        const adjustments = await prisma.shiftAdjustmentRequest.findMany({
          where,
          include: {
            user: {
              select: {
                name: true,
                employeeId: true,
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

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res
          .status(405)
          .json({ message: `Method ${method} Not Allowed` });
    }
  } catch (error) {
    console.error('Error in shift adjustments:', error);
    return res.status(500).json({
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

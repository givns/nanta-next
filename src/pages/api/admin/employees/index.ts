// pages/api/admin/employees/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { initializeServices } from '@/services/ServiceInitializer';

const prisma = new PrismaClient();
const services = initializeServices(prisma);
const { shiftService } = services;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // First verify the requesting user is an admin
    const adminUser = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true },
    });

    if (!adminUser || !['Admin', 'SuperAdmin'].includes(adminUser.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    switch (req.method) {
      case 'GET': {
        // Added block scope with curly braces
        const employees = await prisma.user.findMany({
          select: {
            id: true,
            employeeId: true,
            name: true,
            nickname: true,
            departmentName: true,
            role: true,
            employeeType: true,
            shiftCode: true,
            company: true,
            isGovernmentRegistered: true,
            baseSalary: true,
            salaryType: true,
            bankAccountNumber: true,
            sickLeaveBalance: true,
            businessLeaveBalance: true,
            annualLeaveBalance: true,
          },
          where: {
            isRegistrationComplete: 'Yes',
          },
          orderBy: {
            employeeId: 'asc',
          },
        });

        const employeesWithShifts = await Promise.all(
          employees.map(async (emp) => {
            if (emp.shiftCode) {
              const shift = await shiftService.getShiftByCode(emp.shiftCode);
              return { ...emp, shift };
            }
            return emp;
          }),
        );

        return res.status(200).json(employeesWithShifts);
      }

      case 'POST': {
        // Added block scope with curly braces
        const newEmployee = await prisma.user.create({
          data: req.body,
        });
        return res.status(201).json(newEmployee);
      }

      default: {
        // Added block scope with curly braces
        res.setHeader('Allow', ['GET', 'POST']);
        return res
          .status(405)
          .json({ message: `Method ${req.method} Not Allowed` });
      }
    }
  } catch (error) {
    console.error('Error handling employee request:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

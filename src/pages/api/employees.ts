// pages/api/employees.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from '../../services/ShiftManagementService/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const shiftManagementService = new ShiftManagementService(
  prisma,
  holidayService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      include: { department: true },
    });

    if (!user) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let employees;

    if (user.role === 'Manager') {
      // Fetch only employees from the manager's department
      employees = await prisma.user.findMany({
        where: {
          role: 'Employee',
          departmentId: user.departmentId,
        },
        select: {
          id: true,
          name: true,
          employeeId: true,
          departmentName: true,
          shiftCode: true,
        },
      });
    } else if (user.role === 'Admin' || user.role === 'SuperAdmin') {
      // Fetch all employees grouped by department
      const departments = await prisma.department.findMany({
        include: {
          users: {
            where: { role: 'Employee' },
            select: {
              id: true,
              name: true,
              employeeId: true,
              departmentName: true,
              shiftCode: true,
            },
          },
        },
      });

      employees = departments.flatMap((dept) => dept.users);
    } else {
      return res.status(403).json({ message: 'Unauthorized' });
    }
    // Fetch shift information for all employees
    const employeesWithShifts = await Promise.all(
      employees.map(async (emp) => {
        if (emp.shiftCode) {
          const shift = await shiftManagementService.getShiftByCode(
            emp.shiftCode,
          );
          return { ...emp, shift };
        }
        return emp;
      }),
    );

    res.status(200).json(employeesWithShifts);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees' });
  }
}

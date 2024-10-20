// pages/api/employees.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../types/enum';

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
            },
          },
        },
      });

      employees = departments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        employees: dept.users,
      }));
    } else {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.status(200).json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees' });
  }
}

// pages/api/employees.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../types/enum'; // Make sure to import from the correct path

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
    const manager = await prisma.user.findUnique({
      where: { lineUserId },
      include: { department: true },
    });

    if (
      !manager ||
      ![UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPERADMIN].includes(
        manager.role as UserRole,
      )
    ) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    let employees;

    if (
      manager.role === UserRole.ADMIN ||
      manager.role === UserRole.SUPERADMIN
    ) {
      employees = await prisma.user.findMany({
        where: { role: UserRole.GENERAL },
        select: {
          id: true,
          name: true,
          employeeId: true,
          departmentName: true,
        },
      });
    } else {
      employees = await prisma.user.findMany({
        where: {
          role: UserRole.GENERAL,
          departmentId: manager.departmentId,
        },
        select: {
          id: true,
          name: true,
          employeeId: true,
          departmentName: true,
        },
      });
    }

    res.status(200).json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ message: 'Error fetching employees' });
  }
}

// pages/api/departments.ts

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { UserRole } from '../../types/enum';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    try {
      const departments = await prisma.department.findMany({
        select: {
          id: true,
          name: true,
          users: {
            where: {
              role: UserRole.GENERAL,
            },
            select: {
              id: true,
              name: true,
              employeeId: true,
            },
          },
        },
      });

      const formattedDepartments = departments.map((dept) => ({
        id: dept.id,
        name: dept.name,
        employees: dept.users,
      }));

      res.status(200).json(formattedDepartments);
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ message: 'Error fetching departments' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

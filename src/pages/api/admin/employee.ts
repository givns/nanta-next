// pages/api/admin/employees.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { EmployeeListResponse } from '@/types/payroll';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmployeeListResponse[] | { error: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'];
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const employees = await prisma.user.findMany({
      select: {
        employeeId: true,
        name: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return res.status(200).json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ error: 'Failed to fetch employees' });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { getUserRole } from '../../../utils/auth';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userRole = await getUserRole(lineUserId);
  if (userRole !== 'ADMIN' && userRole !== 'SUPERADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'GET') {
    try {
      const employees = await prisma.user.findMany({
        include: { department: true, assignedShift: true },
      });
      res.status(200).json(employees);
    } catch (error) {
      console.error('Error fetching employees:', error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  } else if (req.method === 'POST') {
    const {
      name,
      nickname,
      departmentId,
      role,
      employeeType,
      isGovernmentRegistered,
      company,
    } = req.body;

    try {
      // Find the latest employee ID
      const latestEmployee = await prisma.user.findFirst({
        orderBy: { employeeId: 'desc' },
      });

      let newEmployeeId;
      if (latestEmployee) {
        const latestId = parseInt(latestEmployee.employeeId.substring(1));
        newEmployeeId = `E${(latestId + 1).toString().padStart(4, '0')}`;
      } else {
        newEmployeeId = 'E1001'; // Start from E1001 if no employees exist
      }

      const newEmployee = await prisma.user.create({
        data: {
          employeeId: newEmployeeId,
          name,
          nickname,
          department: { connect: { id: departmentId } },
          role,
          employeeType,
          isGovernmentRegistered,
          company,
        },
        include: { department: true, assignedShift: true },
      });
      res.status(201).json(newEmployee);
    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(400).json({ error: 'Error creating employee' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

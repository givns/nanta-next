// pages/api/employees/index.ts
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
      company,
      employeeType,
      isGovernmentRegistered,
      profilePictureUrl,
      shiftId,
    } = req.body;

    try {
      const newEmployee = await prisma.user.create({
        data: {
          employeeId: `EMP${Date.now()}`, // Generate a unique employee ID
          name,
          nickname,
          department: { connect: { id: departmentId } },
          role,
          company,
          employeeType,
          isGovernmentRegistered,
          profilePictureUrl,
          assignedShift: { connect: { id: shiftId } },
          isRegistrationComplete: true,
          sickLeaveBalance: 30,
          businessLeaveBalance: 3,
          annualLeaveBalance: 6,
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

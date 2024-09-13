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
  if (userRole !== 'Admin' && userRole !== 'SuperAdmin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'GET') {
    const employees = await prisma.user.findMany({
      include: { department: true, assignedShift: true },
    });
    res.status(200).json(employees);
  } else if (req.method === 'POST') {
    const {
      employeeId,
      name,
      nickname,
      departmentId,
      role,
      company,
      employeeType,
      isGovernmentRegistered,
      profilePictureUrl,
      shiftId,
      isPreImported,
    } = req.body;

    try {
      const newEmployee = await prisma.user.create({
        data: {
          employeeId,
          name,
          nickname,
          department: { connect: { id: departmentId } },
          role,
          company,
          employeeType: employeeType || 'PROBATION',
          isGovernmentRegistered: isGovernmentRegistered || false,
          assignedShift: { connect: { id: shiftId } },
          isPreImported: isPreImported || false,
          isRegistrationComplete: false,
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

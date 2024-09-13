// pages/api/employees/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { getUserRole } from '../../../utils/auth';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Received headers:', req.headers);
  const lineUserId = req.headers['x-line-userid'];
  console.log('Extracted lineUserId:', lineUserId);

  if (!lineUserId || typeof lineUserId !== 'string') {
    console.error('No valid lineUserId provided');
    return res
      .status(401)
      .json({ error: 'Unauthorized: No valid LINE User ID provided' });
  }

  try {
    const userRole = await getUserRole(lineUserId);
    console.log('User role:', userRole);

    if (userRole !== 'ADMIN' && userRole !== 'SuperAdmin') {
      console.error('User does not have required role');
      return res
        .status(403)
        .json({ error: 'Forbidden: Insufficient permissions' });
    }

    if (req.method === 'GET') {
      const employees = await prisma.user.findMany({
        include: { department: true, assignedShift: true },
      });
      console.log('Fetched employees:', employees.length);
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
        console.error('Error in creating new employee:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in /api/employees:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

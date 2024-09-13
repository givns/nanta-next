// pages/api/employees/[id].ts
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

    const { id } = req.query;

    if (req.method === 'PUT') {
      const {
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
        const updatedEmployee = await prisma.user.update({
          where: { id: String(id) },
          data: {
            name,
            nickname,
            department: { connect: { id: departmentId } },
            role,
            company,
            employeeType,
            isGovernmentRegistered,
            assignedShift: { connect: { id: shiftId } },
            isPreImported,
          },
          include: { department: true, assignedShift: true },
        });
        res.status(200).json(updatedEmployee);
      } catch (error) {
        console.error('Error updating employee:', error);
        res.status(400).json({ error: 'Error updating employee' });
      }
    } else if (req.method === 'DELETE') {
      try {
        await prisma.user.delete({ where: { id: String(id) } });
        res.status(204).end();
      } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(400).json({ error: 'Error deleting employee' });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Error in /api/employees/[id]:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

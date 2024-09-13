// pages/api/employees/[id].ts
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
      profilePictureUrl,
      shiftId,
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
          profilePictureUrl,
          assignedShift: { connect: { id: shiftId } },
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
}

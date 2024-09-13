import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, User, Department, Shift } from '@prisma/client';
import { getUserRole } from '../../../utils/auth';

const prisma = new PrismaClient();

type EmployeeWithRelations = User & {
  department: Department | null;
  assignedShift: Shift | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Received headers:', JSON.stringify(req.headers, null, 2));
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

    if (userRole !== 'Admin' && userRole !== 'SuperAdmin') {
      console.error('User does not have required role');
      return res
        .status(403)
        .json({ error: 'Forbidden: Insufficient permissions' });
    }

    if (req.method === 'GET') {
      const users = await prisma.user.findMany({
        include: {
          department: true,
          assignedShift: true,
        },
      });

      const mappedEmployees = users.map((user: EmployeeWithRelations) => ({
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        nickname: user.nickname,
        department: user.department
          ? { id: user.department.id, name: user.department.name }
          : { id: 'unassigned', name: 'Unassigned' },
        role: user.role,
        assignedShift: user.assignedShift
          ? { id: user.assignedShift.id, name: user.assignedShift.name }
          : { id: 'no-shift', name: 'No Shift Assigned' },
        isLegacyUser: !user.department && !user.assignedShift,
      }));

      console.log('Fetched employees:', mappedEmployees.length);
      res.status(200).json(mappedEmployees);
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error: any) {
    console.error('Error in /api/employees:', error);
    res
      .status(500)
      .json({ error: 'Internal Server Error', details: error.message });
  } finally {
    await prisma.$disconnect();
  }
}

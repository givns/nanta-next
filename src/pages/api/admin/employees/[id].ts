// pages/api/admin/employees/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { id } = req.query;
  const lineUserId = req.headers['x-line-userid'] as string;

  if (!lineUserId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { lineUserId },
      select: { role: true },
    });

    if (!user || !['Admin', 'SuperAdmin'].includes(user.role)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const { id } = req.query;

    switch (req.method) {
      case 'PUT': {
        try {
          console.log('Updating employee:', id, 'with data:', req.body);

          const updatedEmployee = await prisma.user.update({
            where: { id: String(id) },
            data: {
              name: req.body.name,
              nickname: req.body.nickname,
              departmentName: req.body.departmentName,
              role: req.body.role,
              employeeType: req.body.employeeType,
              isGovernmentRegistered: req.body.isGovernmentRegistered
                ? 'Yes'
                : 'No',
              company: req.body.company,
              shiftCode: req.body.shiftCode,
              baseSalary: req.body.baseSalary
                ? parseFloat(req.body.baseSalary)
                : null,
              salaryType: req.body.salaryType,
              bankAccountNumber: req.body.bankAccountNumber,
              sickLeaveBalance: req.body.sickLeaveBalance,
              businessLeaveBalance: req.body.businessLeaveBalance,
              annualLeaveBalance: req.body.annualLeaveBalance,
            },
          });

          console.log('Employee updated:', updatedEmployee);
          return res.status(200).json(updatedEmployee);
        } catch (error) {
          console.error('Error updating employee:', error);
          return res.status(500).json({
            message: 'Error updating employee',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      case 'DELETE': {
        try {
          await prisma.user.delete({
            where: { id: String(id) },
          });
          return res.status(204).end();
        } catch (error) {
          return res.status(500).json({ message: 'Error deleting employee' });
        }
      }

      default:
        res.setHeader('Allow', ['PUT', 'DELETE']);
        return res
          .status(405)
          .json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('Error handling employee request:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

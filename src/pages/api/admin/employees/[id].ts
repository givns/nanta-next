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

    switch (req.method) {
      case 'PUT':
        const updatedEmployee = await prisma.user.update({
          where: { id: String(id) },
          data: req.body,
        });
        return res.status(200).json(updatedEmployee);

      case 'DELETE':
        await prisma.user.delete({
          where: { id: String(id) },
        });
        return res.status(204).end();

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

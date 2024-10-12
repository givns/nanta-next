// pages/api/overtime/pending.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const { userRole, departmentId, page = '1', pageSize = '10' } = req.query;

    const currentPage = parseInt(page as string, 10);
    const itemsPerPage = parseInt(pageSize as string, 10);

    try {
      let where: any = {
        status: { in: ['pending', 'pending_approval'] },
      };

      // If the user is an admin (not super admin), filter by department
      if (userRole === 'ADMIN') {
        where = {
          ...where,
          user: {
            departmentId: departmentId as string,
          },
        };
      }

      const [pendingRequests, totalCount] = await prisma.$transaction([
        prisma.overtimeRequest.findMany({
          where,
          include: {
            user: {
              include: {
                department: true,
              },
            },
          },
          orderBy: { date: 'desc' },
          skip: (currentPage - 1) * itemsPerPage,
          take: itemsPerPage,
        }),
        prisma.overtimeRequest.count({ where }),
      ]);

      const totalPages = Math.ceil(totalCount / itemsPerPage);

      res.status(200).json({
        requests: pendingRequests,
        currentPage,
        totalPages,
        totalCount,
      });
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      res.status(500).json({ message: 'Error fetching pending requests' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

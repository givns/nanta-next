// pages/api/overtime/pending.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const {
      page = '1',
      pageSize = '10',
      sortField = 'date',
      sortOrder = 'desc',
      filterDate,
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string);
    const take = parseInt(pageSize as string);

    try {
      const where = {
        status: 'pending',
        ...(filterDate ? { date: new Date(filterDate as string) } : {}),
      };

      const [requests, total] = await Promise.all([
        prisma.overtimeRequest.findMany({
          where,
          include: { user: true },
          skip,
          take,
          orderBy: { [sortField as string]: sortOrder },
        }),
        prisma.overtimeRequest.count({ where }),
      ]);

      res.status(200).json({ requests, total });
    } catch (error) {
      console.error('Error fetching pending requests:', error);
      res.status(500).json({ message: 'Error fetching pending requests' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

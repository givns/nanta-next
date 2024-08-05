// pages/api/overtime/existing-requests.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    const { lineUserId } = req.query;

    if (!lineUserId) {
      return res.status(400).json({ message: 'Line User ID is required' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { lineUserId: lineUserId as string },
      });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const existingRequests = await prisma.overtimeRequest.findMany({
        where: {
          employeeId: user.employeeId,
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 10, // Limit to the 10 most recent requests
      });

      res.status(200).json(existingRequests);
    } catch (error) {
      console.error('Error fetching existing requests:', error);
      res.status(500).json({ message: 'Error fetching existing requests' });
    }
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

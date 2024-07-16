// pages/api/overtime/update-request/[id].ts

import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { id } = req.query;
    const { lineUserId, date, overtimeType, startTime, endTime, reason } =
      req.body;

    if (
      !lineUserId ||
      !date ||
      !overtimeType ||
      !startTime ||
      !endTime ||
      !reason
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { lineUserId } });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      const updatedRequest = await prisma.overtimeRequest.update({
        where: { id: id as string },
        data: {
          date: new Date(date),
          startTime,
          endTime,
          reason,
          status: 'pending', // Reset status to pending when updated
        },
      });

      res.status(200).json({
        success: true,
        message: 'Overtime request updated successfully',
        data: updatedRequest,
      });
    } catch (error: any) {
      console.error('Error updating overtime request:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message,
      });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

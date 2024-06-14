import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { userId, leaveType, reason, startDate, endDate, leaveFormat } =
      req.body;

    console.log('Request Body:', req.body);

    try {
      if (
        !userId ||
        !leaveType ||
        !reason ||
        !startDate ||
        !endDate ||
        !leaveFormat
      ) {
        console.error('Missing required fields');
        return res
          .status(400)
          .json({ success: false, error: 'Missing required fields' });
      }

      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: 'pending',
        },
      });

      console.log('New Leave Request:', newLeaveRequest);
      res.status(201).json(newLeaveRequest);
    } catch (error: any) {
      console.error(
        'Error creating leave request:',
        error.message,
        error.stack,
      );
      res.status(500).json({ success: false, error: error.message });
    } finally {
      await prisma.$disconnect();
    }
  } else if (req.method === 'GET') {
    try {
      const leaveRequests = await prisma.leaveRequest.findMany();
      res.status(200).json(leaveRequests);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

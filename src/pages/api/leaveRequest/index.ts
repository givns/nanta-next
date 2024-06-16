import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const {
      lineUserId,
      leaveType,
      leaveFormat,
      reason,
      startDate,
      endDate,
      status,
    } = req.body;

    if (
      !lineUserId ||
      !leaveType ||
      !leaveFormat ||
      !reason ||
      !startDate ||
      !endDate
    ) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId: lineUserId,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status: status || 'pending',
        },
      });
      res.status(201).json(newLeaveRequest);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

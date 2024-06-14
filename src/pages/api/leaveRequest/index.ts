import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const {
      userId,
      leaveType,
      reason,
      startDate,
      endDate,
      status,
      leaveFormat,
    } = req.body;

    try {
      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveType,
          leaveFormat,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status,
        },
      });
      res.status(201).json(newLeaveRequest);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else if (req.method === 'GET') {
    try {
      const leaveRequests = await prisma.leaveRequest.findMany();
      res.status(200).json(leaveRequests);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

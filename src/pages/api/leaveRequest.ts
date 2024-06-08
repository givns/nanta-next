import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Handle GET request - fetch all leave requests
    try {
      const leaveRequests = await prisma.leaveRequest.findMany();
      res.status(200).json(leaveRequests);
    } catch (error) {
      console.error('Error fetching leave requests:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      await prisma.$disconnect();
    }
  } else if (req.method === 'POST') {
    // Handle POST request - create a new leave request
    const { userId, leaveType, reason, startDate, endDate, status } = req.body;
    try {
      const newLeaveRequest = await prisma.leaveRequest.create({
        data: {
          userId,
          leaveType,
          reason,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          status,
        },
      });
      res.status(201).json(newLeaveRequest);
    } catch (error) {
      console.error('Error creating leave request:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
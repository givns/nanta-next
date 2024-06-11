import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'GET') {
    // Handle GET request - fetch all check-ins
    try {
      const checkIns = await prisma.checkIn.findMany();
      res.status(200).json(checkIns);
    } catch (error) {
      console.error('Error fetching check-ins:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      await prisma.$disconnect();
    }
  } else if (req.method === 'POST') {
    // Handle POST request - create a new check-in
    const { userId, date, status } = req.body;
    try {
      const newCheckIn = await prisma.checkIn.create({
        data: {
          userId,
          date: new Date(date),
          status,
        },
      });
      res.status(201).json(newCheckIn);
    } catch (error) {
      console.error('Error creating check-in:', error);
      res.status(500).send('Internal Server Error');
    } finally {
      await prisma.$disconnect();
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

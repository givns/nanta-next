import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Fetch all overtime requests from the database
    const overtimeRequests = await prisma.overtimeRequest.findMany();
    res.status(200).json(overtimeRequests);
  } catch (error) {
    console.error('Error fetching overtime requests:', error);
    res.status(500).send('Internal Server Error');
  } finally {
    await prisma.$disconnect();
  }
}

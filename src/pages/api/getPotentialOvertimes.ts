//pages/api/getPotentialOvertimes.ts
import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  try {
    const potentialOvertimes = await prisma.potentialOvertime.findMany({
      where: { status: 'pending' },
      orderBy: { date: 'desc' },
    });

    res.status(200).json({ requests: potentialOvertimes });
  } catch (error) {
    console.error('Error fetching potential overtimes:', error);
    res.status(500).send('Internal Server Error');
  } finally {
    await prisma.$disconnect();
  }
}

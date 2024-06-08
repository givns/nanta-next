import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';  

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    res.status(400).json({ error: 'Invalid userId' });
    return;
  }

  try {
    const overtimeRequests = await prisma.overtimeRequest.findMany({
      where: { userId },
    });

    const totalOvertimeHours = overtimeRequests.reduce((total, request) => total + request.hours, 0);

    res.status(200).json({ totalOvertimeHours });
  } catch (error) {
    console.error('Error fetching overtime balance:', error);
    res.status(500).send('Internal Server Error');
  }
}
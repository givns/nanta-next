import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { requestId, type, action } = req.body;

  if (!requestId || !type || !action) {
    res.status(400).json({ error: 'Invalid requestId, type, or action' });
    return;
  }

  try {
    let updatedRequest;
    if (type === 'leave') {
      updatedRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: action },
      });
    } else if (type === 'overtime') {
      updatedRequest = await prisma.overtimeRequest.update({
        where: { id: requestId },
        data: { status: action },
      });
    } else if (type === 'potentialOvertime') {
      updatedRequest = await prisma.potentialOvertime.update({
        where: { id: requestId },
        data: { status: action },
      });
    } else {
      res.status(400).json({ error: 'Invalid request type' });
      return;
    }

    res.status(200).json(updatedRequest);
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Internal Server Error');
  } finally {
    await prisma.$disconnect();
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '@/utils/db';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
    return;
  }

  const { requestId, requestType } = req.body;

  if (!requestId || !requestType) {
    res.status(400).json({ error: 'Invalid requestId or requestType' });
    return;
  }

  try {
    let updatedRequest;
    if (requestType === 'leave') {
      updatedRequest = await prisma.leaveRequest.update({
        where: { id: requestId },
        data: { status: 'approved' },
      });
    } else if (requestType === 'overtime') {
      updatedRequest = await prisma.overtimeRequest.update({
        where: { id: requestId },
        data: { status: 'approved' },
      });
    } else {
      res.status(400).json({ error: 'Invalid requestType' });
      return;
    }

    res.status(200).json(updatedRequest);
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).send('Internal Server Error');
  } finally {
    await prisma.$disconnect();
  }
}

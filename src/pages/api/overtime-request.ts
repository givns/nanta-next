import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { requestId } = req.query;
  if (typeof requestId !== 'string') {
    return res.status(400).json({ error: 'Invalid requestId' });
  }

  const request = await prisma.overtimeRequest.findUnique({
    where: { id: requestId },
  });
  res.status(200).json({ request });
}

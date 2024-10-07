import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { employeeId } = req.query;
  if (typeof employeeId !== 'string') {
    return res.status(400).json({ error: 'Invalid employeeId' });
  }

  const user = await prisma.user.findUnique({ where: { employeeId } });
  res.status(200).json({ user });
}

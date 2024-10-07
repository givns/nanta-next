import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { UserRole } from '@/types/enum';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const users = await prisma.user.findMany({
    where: {
      role: {
        in: [UserRole.ADMIN, UserRole.SUPERADMIN],
      },
    },
  });
  res.status(200).json({ users });
}

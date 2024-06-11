import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, role } = req.body;

  if (!userId || !role) {
    return res.status(400).json({ error: 'Missing userId or role' });
  }

  // Validate role
  const validRoles = ['general', 'special', 'admin', 'super-admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    if (error instanceof Error) {
      res.status(500).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'An unknown error occurred' });
    }
  }
}

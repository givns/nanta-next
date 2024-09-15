// pages/api/updateProfilePicture.ts

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

  const { employeeId, profilePictureUrl } = req.body;

  if (!employeeId || !profilePictureUrl) {
    return res
      .status(400)
      .json({ error: 'Missing employee ID or profile picture URL' });
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { employeeId },
      data: { profilePictureUrl },
    });

    res.status(200).json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Error updating profile picture:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

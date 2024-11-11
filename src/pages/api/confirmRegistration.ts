// pages/api/confirmRegistration.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, lineUserId, profilePictureUrl } = req.body;

  try {
    const updatedUser = await prisma.user.update({
      where: { employeeId },
      data: {
        lineUserId,
        profilePictureUrl,
        isRegistrationComplete: 'Yes',
      },
    });

    res.status(200).json({
      success: true,
      user: updatedUser,
    });
  } catch (error: any) {
    console.error('Error confirming registration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to confirm registration',
    });
  }
}

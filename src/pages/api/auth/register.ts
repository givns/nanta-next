// api/auth/register.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { Client } from '@line/bot-sdk';
import { RICH_MENU_IDS } from '@/constants/richMenus';

const prisma = new PrismaClient();
const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const lineUserId = req.headers['x-line-userid'] as string;
  if (!lineUserId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { employeeId, profilePictureUrl } = req.body;

  try {
    // Update user record
    const updatedUser = await prisma.user.update({
      where: { employeeId },
      data: {
        lineUserId,
        profilePictureUrl,
        isRegistrationComplete: 'Yes',
      },
      include: {
        department: true,
      },
    });

    // Assign rich menu based on role
    const richMenuId = getRichMenuIdForRole(updatedUser.role);
    await client.linkRichMenuToUser(lineUserId, richMenuId);

    return res.status(200).json({
      success: true,
      user: updatedUser,
      message: 'Registration completed successfully',
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Registration failed',
    });
  }
}

function getRichMenuIdForRole(role: string): string {
  switch (role) {
    case 'Admin':
    case 'SuperAdmin':
      return RICH_MENU_IDS.ADMIN_1;
    case 'Manager':
      return RICH_MENU_IDS.MANAGER;
    case 'Driver':
      return RICH_MENU_IDS.DRIVER;
    default:
      return RICH_MENU_IDS.GENERAL;
  }
}
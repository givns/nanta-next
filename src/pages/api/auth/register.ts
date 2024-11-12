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
    console.log('Starting registration for:', { employeeId, lineUserId });

    // Log the user before update
    const beforeUser = await prisma.user.findUnique({
      where: { employeeId },
    });
    console.log('User before update:', beforeUser);

    // Update user record with explicit data
    const updatedUser = await prisma.user.update({
      where: { employeeId },
      data: {
        lineUserId,
        profilePictureUrl: profilePictureUrl || undefined,
        isRegistrationComplete: 'Yes', // Explicitly set this
        updatedAt: new Date(), // Force update timestamp
      },
      include: {
        department: true,
      },
    });

    // Log the updated user
    console.log('User after update:', updatedUser);

    // Verify the update
    const verifyUser = await prisma.user.findUnique({
      where: { employeeId },
    });
    console.log('Verification query result:', verifyUser);

    // Double-check if the update was successful
    if (verifyUser?.isRegistrationComplete !== 'Yes') {
      throw new Error('Registration status not updated properly');
    }

    // Assign rich menu based on role
    try {
      const richMenuId = getRichMenuIdForRole(updatedUser.role);
      await client.linkRichMenuToUser(lineUserId, richMenuId);
      console.log('Rich menu assigned:', richMenuId);
    } catch (menuError) {
      console.error('Error assigning rich menu:', menuError);
      // Don't fail the registration if menu assignment fails
    }

    // Send success response
    return res.status(200).json({
      success: true,
      user: updatedUser,
      message: 'Registration completed successfully',
    });
  } catch (error: any) {
    console.error('Registration error:', error);

    // Try to log the current state
    try {
      const currentState = await prisma.user.findUnique({
        where: { employeeId },
      });
      console.log('User state after error:', currentState);
    } catch (logError) {
      console.error('Error logging user state:', logError);
    }

    return res.status(500).json({
      success: false,
      error: error.message || 'Registration failed',
      details: 'Check server logs for more information',
    });
  }
}

function getRichMenuIdForRole(role: string): string {
  switch (role.toLowerCase()) {
    case 'admin':
    case 'superadmin':
      return RICH_MENU_IDS.ADMIN_1;
    case 'manager':
      return RICH_MENU_IDS.MANAGER;
    case 'driver':
      return RICH_MENU_IDS.DRIVER;
    default:
      return RICH_MENU_IDS.GENERAL;
  }
}

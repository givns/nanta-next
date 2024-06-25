import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';
import { Client } from '@line/bot-sdk';
import { UserRole } from '../../types/userRole';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { lineUserId, name, nickname, department, profilePictureUrl } =
      req.body;

    try {
      // Check if the user already exists
      let user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      // Determine the role and rich menu ID
      let role: UserRole;

      // Check if this is the first user and assign super admin role
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        role = UserRole.SUPERADMIN;
      } else {
        switch (department) {
          case 'ฝ่ายขนส่ง':
            role = UserRole.DRIVER;
            break;
          case 'ฝ่ายปฏิบัติการ':
            role = UserRole.OPERATION;
            break;
          default:
            role = UserRole.GENERAL;
        }
      }

      // If user does not exist, create a new one
      if (!user) {
        user = await prisma.user.create({
          data: {
            lineUserId,
            name,
            nickname,
            department,
            profilePictureUrl, // Save the profile picture URL
            role,
          },
        });
      } else {
        // Update the existing user
        user = await prisma.user.update({
          where: { lineUserId },
          data: {
            name,
            nickname,
            department,
            profilePictureUrl, // Ensure the profile picture URL is updated
            role, // Ensure the role is updated if department changes
          },
        });
      }

      // Determine the appropriate rich menu based on role
      let richMenuId: string;
      switch (role) {
        case UserRole.SUPERADMIN:
          richMenuId = 'richmenu-0ea158465f8926515b7d159f18bfb6d6'; // Super Admin Rich Menu
          break;
        case UserRole.DRIVER:
          richMenuId = 'richmenu-741553f870a405009fec483601830523'; // Placeholder for Route Rich Menu
          break;
        case UserRole.OPERATION:
          richMenuId = 'richmenu-2fc50f25f3582448a3f53be2822cc66b'; // Special Rich Menu
          break;
        case UserRole.GENERAL:
        default:
          richMenuId = 'richmenu-741553f870a405009fec483601830523'; // General User Rich Menu
      }

      // Link the rich menu to the user
      await client.linkRichMenuToUser(lineUserId, richMenuId);

      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

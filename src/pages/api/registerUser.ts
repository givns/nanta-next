import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { lineUserId, name, nickname, department } = req.body;

    try {
      // Check if the user already exists
      let user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      // Determine the role and rich menu ID
      let role = 'general'; // Default role

      // Check if this is the first user and assign super admin role
      const userCount = await prisma.user.count();
      if (userCount === 0) {
        role = 'superadmin';
      }

      // If user does not exist, create a new one
      if (!user) {
        user = await prisma.user.create({
          data: {
            lineUserId,
            name,
            nickname,
            department,
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
            role, // Ensure the role is updated if department changes
          },
        });
      }

      // Determine the appropriate rich menu based on role
      let richMenuId;
      if (role === 'superadmin') {
        richMenuId = 'richmenu-aa17766abb97f3e2ba5088be6cc69f43'; // Super Admin Rich Menu
      } else if (role === 'admin') {
        richMenuId = 'richmenu-8da5f496f63cf0043ac867e7b08ece7a'; // Admin Rich Menu
      } else if (['ฝ่ายขนส่ง', 'ฝ่ายปฏิบัติการ'].includes(department)) {
        richMenuId = 'richmenu-3670f2aed131fea8ca22d349188f12ee'; // Special User Rich Menu
      } else {
        richMenuId = 'richmenu-0ba7f3459e24877a48eeae1fc946f38b'; // General User Rich Menu
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

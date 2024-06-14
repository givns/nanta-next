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

      // Determine the role based on department
      let role = 'general';
      if (['ฝ่ายขนส่ง', 'ฝ่ายปฏิบัติการ'].includes(department)) {
        role = 'special';
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
            role,
          },
        });
      }

      // Determine the appropriate rich menu based on role
      let richMenuId = 'richmenu-0ba7f3459e24877a48eeae1fc946f38b'; // Default to General User Rich Menu
      if (role === 'special') {
        richMenuId = 'richmenu-3670f2aed131fea8ca22d349188f12ee'; // Special User Rich Menu
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

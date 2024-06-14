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
        richMenuId = 'richmenu-5610259c0139fc6a9d6475b628986fcf'; // Super Admin Rich Menu
      } else if (role === 'admin') {
        richMenuId = 'richmenu-2e10f099c17149de5386d2cf6f936051'; // Admin Rich Menu
      } else if (['ฝ่ายขนส่ง', 'ฝ่ายปฏิบัติการ'].includes(department)) {
        richMenuId = 'richmenu-d07da0e5fa90760bc50f7b2deec89ca2'; // Special User Rich Menu
      } else {
        richMenuId = 'richmenu-581e59c118fd514a45fc01d6f301138e'; // General User Rich Menu
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

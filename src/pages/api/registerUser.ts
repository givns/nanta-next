import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';
import { Client } from '@line/bot-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
if (!channelAccessToken) {
  throw new Error('LINE_CHANNEL_ACCESS_TOKEN must be defined in .env.local');
}

const client = new Client({ channelAccessToken });

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { lineUserId, name, nickname, department, employeeNumber } = req.body;

    try {
      // Check if the user already exists
      let user = await prisma.user.findUnique({
        where: { lineUserId },
      });

      // If user does not exist, create a new one
      if (!user) {
        // Check if this is the first user
        const userCount = await prisma.user.count();
        const role = userCount === 0 ? 'superadmin' : 'general';

        user = await prisma.user.create({
          data: {
            lineUserId,
            name,
            nickname,
            department,
            employeeNumber,
            role,
          },
        });

        // Assign the appropriate rich menu based on department
        const richMenuId =
          department === 'Transport' || department === 'Management'
            ? 'richmenu-3670f2aed131fea8ca22d349188f12ee' // Special Rich Menu
            : 'richmenu-0ba7f3459e24877a48eeae1fc946f38b'; // General Rich Menu

        await client.linkRichMenuToUser(lineUserId, richMenuId);
        console.log(`Rich menu linked to user ${lineUserId}: ${richMenuId}`);
      }

      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../utils/db';
import { Client } from '@line/bot-sdk';

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
        user = await prisma.user.create({
          data: {
            lineUserId,
            name,
            nickname,
            department,
            employeeNumber,
            role: 'general',
          },
        });
      }

      // Assign the correct rich menu based on the user's department
      let richMenuId = '';

      if (department === 'ฝ่ายขนส่ง' || department === 'ฝ่ายปฏิบัติการ') {
        richMenuId = 'richmenu-3670f2aed131fea8ca22d349188f12ee';
      } else {
        richMenuId = 'richmenu-0ba7f3459e24877a48eeae1fc946f38b';
      }

      await client.linkRichMenuToUser(lineUserId, richMenuId);
      console.log(`Rich menu linked to user ${lineUserId}: ${richMenuId}`);

      res.status(201).json({ success: true, data: user });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
}

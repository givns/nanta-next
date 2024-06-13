import { NextApiRequest, NextApiResponse } from 'next';
import { Client } from '@line/bot-sdk';
import dotenv from 'dotenv';

dotenv.config({ path: './.env.local' });

const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
if (!channelAccessToken) {
  throw new Error('LINE_CHANNEL_ACCESS_TOKEN must be defined in .env.local');
}

const client = new Client({ channelAccessToken });

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { userId, richMenuId } = req.body;

  if (!userId || !richMenuId) {
    console.error('userId and richMenuId are required');
    return res.status(400).send('userId and richMenuId are required');
  }

  try {
    console.log(`Linking rich menu ${richMenuId} to user ${userId}`);
    await client.linkRichMenuToUser(userId, richMenuId);
    console.log('Rich menu linked successfully');
    res.status(200).send('Rich menu linked successfully');
  } catch (error: any) {
    console.error(`Error linking rich menu: ${error.message}`);
    res.status(500).send(`Error linking rich menu: ${error.message}`);
  }
};

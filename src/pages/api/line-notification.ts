import { Client } from '@line/bot-sdk';
import type { NextApiRequest, NextApiResponse } from 'next';

const client = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    const { lineUserId, message } = req.body;

    if (!lineUserId) {
      return res.status(400).json({ error: 'LINE user ID is required' });
    }

    try {
      await client.pushMessage(lineUserId, {
        type: 'text',
        text: message,
      });
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error sending LINE notification:', error);
      res.status(500).json({ error: 'Failed to send LINE notification' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

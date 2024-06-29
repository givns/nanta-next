import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { to, messages } = req.body;

  try {
    const response = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      {
        to,
        messages,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        },
      },
    );

    res
      .status(200)
      .json({ message: 'Message sent successfully', data: response.data });
  } catch (error: any) {
    console.error('Error sending LINE message:', error);
    res
      .status(500)
      .json({ message: 'Error sending LINE message', error: error.message });
  }
}

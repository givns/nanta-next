// pages/api/cron/send-overtime-digests.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { sendOvertimeDigests } from '../../../jobs/sendOvertimeDigests';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === 'POST') {
    try {
      await sendOvertimeDigests();
      res.status(200).json({ message: 'Overtime digests sent successfully' });
    } catch (error) {
      console.error('Error sending overtime digests:', error);
      res.status(500).json({ message: 'Error sending overtime digests' });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

// pages/api/cron/send-overtime-digests.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { sendOvertimeDigests } from '../../../jobs/sendOvertimeDigests';

const API_KEY = process.env.CRON_API_KEY;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Received request for sending overtime digests');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  const isVercelCron = req.headers['user-agent'] === 'vercel-cron/1.0';
  const hasValidApiKey = req.headers['x-api-key'] === API_KEY;

  if (IS_PRODUCTION && !isVercelCron && !hasValidApiKey) {
    console.error('Unauthorized attempt to send overtime digests');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'GET' || req.method === 'POST') {
    try {
      console.log('Starting to send overtime digests');
      await sendOvertimeDigests();
      console.log('Overtime digests sent successfully');
      return res
        .status(200)
        .json({ message: 'Overtime digests sent successfully' });
    } catch (error) {
      console.error('Error sending overtime digests:', error);
      return res.status(500).json({
        message: 'Error sending overtime digests',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    console.error(
      `Method ${req.method} not allowed for sending overtime digests`,
    );
    return res.status(405).json({ message: 'Method not allowed' });
  }
}

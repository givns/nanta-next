// pages/api/cron/sync-holidays.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { HolidayService } from '../../../services/HolidayService';

const holidayService = new HolidayService();

const API_KEY = process.env.CRON_API_KEY;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Received request for holiday sync');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  const isVercelCron = req.headers['user-agent'] === 'vercel-cron/1.0';
  const hasValidApiKey = req.headers['x-api-key'] === API_KEY;

  if (IS_PRODUCTION && !isVercelCron && !hasValidApiKey) {
    console.error('Unauthorized attempt to access holiday sync');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'GET' || req.method === 'POST') {
    try {
      console.log('Starting holiday sync');
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;

      await holidayService.syncHolidays(currentYear);
      await holidayService.syncHolidays(nextYear);

      console.log(
        `Holiday sync completed successfully for years ${currentYear} and ${nextYear}`,
      );
      return res.status(200).json({
        message: `Holiday sync completed successfully for years ${currentYear} and ${nextYear}`,
      });
    } catch (error) {
      console.error('Error syncing holidays:', error);
      return res.status(500).json({
        message: 'Error syncing holidays',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    console.error(`Method ${req.method} not allowed for holiday sync`);
    return res.status(405).json({ message: 'Method not allowed' });
  }
}

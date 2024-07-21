// pages/api/cron/sync-attendance.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceSyncService } from '../../../services/AttendanceSyncService';

const attendanceSyncService = new AttendanceSyncService();

const API_KEY = process.env.CRON_API_KEY;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log('Received request for attendance sync');
  console.log('Method:', req.method);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  const isVercelCron = req.headers['user-agent'] === 'vercel-cron/1.0';
  const hasValidApiKey = req.headers['x-api-key'] === API_KEY;

  if (IS_PRODUCTION && !isVercelCron && !hasValidApiKey) {
    console.error('Unauthorized attempt to access attendance sync');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method === 'GET' || req.method === 'POST') {
    try {
      console.log('Starting attendance sync');
      await attendanceSyncService.syncAttendanceData();
      console.log('Attendance sync completed successfully');
      return res
        .status(200)
        .json({ message: 'Attendance sync completed successfully' });
    } catch (error) {
      console.error('Error syncing attendance:', error);
      return res.status(500).json({
        message: 'Error syncing attendance',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  } else {
    console.error(`Method ${req.method} not allowed for attendance sync`);
    return res.status(405).json({ message: 'Method not allowed' });
  }
}

// pages/api/cron/sync-attendance.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceSyncService } from '../../../services/AttendanceSyncService';

const attendanceSyncService = new AttendanceSyncService();

const API_KEY = process.env.CRON_API_KEY;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  console.log(`Received ${req.method} request for attendance sync`);

  if (req.headers['x-api-key'] !== API_KEY) {
    console.error('Unauthorized attempt to access attendance sync');
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    console.error(`Method ${req.method} not allowed for attendance sync`);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('Starting attendance sync');
    await attendanceSyncService.syncAttendanceData();
    console.log('Attendance sync completed successfully');
    res.status(200).json({ message: 'Attendance sync completed successfully' });
  } catch (error) {
    console.error('Error syncing attendance:', error);
    res
      .status(500)
      .json({
        message: 'Error syncing attendance',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
  }
}

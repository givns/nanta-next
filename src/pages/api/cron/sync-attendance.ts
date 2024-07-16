// pages/api/cron/sync-attendance.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceSyncService } from '../../../services/AttendanceSyncService';

const attendanceSyncService = new AttendanceSyncService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await attendanceSyncService.syncAttendanceData();
    res.status(200).json({ message: 'Attendance sync completed successfully' });
  } catch (error) {
    console.error('Error syncing attendance:', error);
    res.status(500).json({ message: 'Error syncing attendance' });
  }
}

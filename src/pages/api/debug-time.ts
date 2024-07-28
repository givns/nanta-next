// New file: pages/api/debug-time.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import moment from 'moment-timezone';
import { AttendanceService } from '../../services/AttendanceService';
import prisma from '../../lib/prisma';

const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ message: 'Valid Employee ID is required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { employeeId } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const rawAttendance = await prisma.attendance.findFirst({
      where: { userId: user.id },
      orderBy: { checkInTime: 'desc' },
    });

    const processedStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);

    const debugInfo = {
      rawCheckInTime: rawAttendance?.checkInTime,
      processedCheckInTime: processedStatus.latestAttendance?.checkInTime,
      serverTime: new Date(),
      serverTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      momentDetectedZone: moment.tz.guess(),
    };

    return res.status(200).json(debugInfo);
  } catch (error) {
    console.error('Error in debug-time handler:', error);
    return res
      .status(500)
      .json({ message: 'Error retrieving debug time info' });
  }
}

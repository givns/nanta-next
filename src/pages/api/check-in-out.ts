// pages/api/check-in-out.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';

const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const {
    userId,
    employeeId,
    checkTime,
    location,
    address,
    reason,
    photo,
    deviceSerial,
  } = req.body;

  if (
    !userId ||
    !employeeId ||
    !checkTime ||
    !location ||
    !address ||
    !deviceSerial
  ) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const attendance = await attendanceService.processAttendance({
      userId,
      employeeId,
      checkTime: new Date(checkTime),
      location,
      address,
      reason,
      photo,
      deviceSerial,
    });
    res.status(200).json(attendance);
  } catch (error) {
    console.error('Check-in/out failed:', error);
    res.status(500).json({ message: 'Check-in/out failed' });
  }
}

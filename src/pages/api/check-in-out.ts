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
    isCheckIn,
  } = req.body;

  // Validate required fields
  if (
    !userId ||
    !employeeId ||
    !checkTime ||
    !location ||
    !address ||
    !deviceSerial ||
    typeof isCheckIn !== 'boolean'
  ) {
    return res
      .status(400)
      .json({ message: 'Missing or invalid required fields' });
  }

  try {
    const attendance = await attendanceService.processAttendance({
      userId,
      employeeId,
      checkTime,
      location,
      address,
      reason,
      photo,
      deviceSerial,
      isCheckIn,
      isOvertime: false, // We'll handle overtime separately in the future
    });

    res.status(200).json(attendance);
  } catch (error: any) {
    console.error('Check-in/out failed:', error);
    res.status(error.statusCode || 500).json({
      message: 'Check-in/out failed',
      error: error.message,
    });
  }
}

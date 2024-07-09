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
    isOvertime,
  } = req.body;

  if (
    !userId ||
    !employeeId ||
    !checkTime ||
    !location ||
    !address ||
    !deviceSerial ||
    typeof isCheckIn !== 'boolean' ||
    typeof isOvertime !== 'boolean'
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
      isOvertime,
    });
    res.status(200).json(attendance);
  } catch (error: any) {
    console.error('Check-in/out failed:', error);
    if (error.name === 'NetworkError') {
      res.status(503).json({ message: 'Network error. Please try again.' });
    } else if (error.name === 'DataConsistencyError') {
      res
        .status(409)
        .json({
          message: 'Data inconsistency detected. Please contact support.',
        });
    } else {
      res
        .status(500)
        .json({ message: 'An unexpected error occurred. Please try again.' });
    }
  }
}

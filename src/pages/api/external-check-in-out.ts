// pages/api/external-check-in-out.ts

import { NextApiRequest, NextApiResponse } from 'next';
import { ExternalDbService } from '../../services/ExternalDbService';
import { AttendanceService } from '../../services/AttendanceService';
import prisma from '../../lib/prisma';

const externalDbService = new ExternalDbService();
const attendanceService = new AttendanceService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const data = req.body;

  try {
    // Create entry in external database
    if (data.isManualEntry) {
      await externalDbService.createManualEntry(data);
    } else {
      await externalDbService.createCheckIn(data);
    }

    // Fetch user info and daily attendance records
    const { userInfo, records } =
      await externalDbService.getDailyAttendanceRecords(data.employeeId);

    if (!userInfo) {
      throw new Error('User not found in external database');
    }

    // Fetch user from our database
    const user = await prisma.user.findUnique({
      where: { employeeId: data.employeeId },
      include: { assignedShift: true },
    });

    if (!user) {
      throw new Error('User not found in our database');
    }

    if (records.length === 0) {
      throw new Error('No attendance records found for today');
    }

    // Get the latest check-in (which should be the one we just created)
    const latestCheckIn = records[records.length - 1];

    // Process the check-in/out
    const attendance = await attendanceService.processExternalCheckInOut(
      latestCheckIn,
      userInfo,
      user.assignedShift,
    );

    res
      .status(200)
      .json({ message: 'Check-in/out processed successfully', attendance });
  } catch (error: any) {
    console.error('Error processing check-in/out:', error);
    res
      .status(500)
      .json({ message: 'Error processing check-in/out', error: error.message });
  }
}

// pages/api/debug-logs.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '../../services/ExternalDbService';
import prisma from '../../lib/prisma';
import moment from 'moment-timezone';

const attendanceService = new AttendanceService();
const externalDbService = new ExternalDbService();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, action } = req.query;

  if (!employeeId || typeof employeeId !== 'string') {
    return res.status(400).json({ message: 'Valid Employee ID is required' });
  }

  try {
    const logs: any = {
      employeeId,
      action,
      timestamp: new Date().toISOString(),
    };

    // Get user data
    logs.userData = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });

    if (!logs.userData) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get attendance status
    logs.attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);

    // Get raw attendance records
    const threeDaysAgo = moment().subtract(3, 'days').toDate();
    logs.internalAttendances = await prisma.attendance.findMany({
      where: {
        userId: logs.userData.id,
        date: { gte: threeDaysAgo },
      },
      orderBy: { date: 'desc' },
    });

    // Get external attendance records
    logs.externalAttendances =
      await externalDbService.getDailyAttendanceRecords(employeeId, 3);

    // Simulate check-in/out if action is provided
    if (action === 'check-in' || action === 'check-out') {
      const simulatedData = {
        employeeId,
        timestamp: new Date(),
        checkType: action === 'check-in' ? 1 : 2,
        deviceSerial: 'DEBUG_DEVICE',
      };

      logs.simulatedAction = simulatedData;

      // Simulate external database entry
      if (action === 'check-in') {
        await externalDbService.createCheckIn(simulatedData);
      } else {
        await externalDbService.createCheckIn({
          ...simulatedData,
          checkType: 2,
        });
      }

      // Get updated attendance status after simulation
      logs.updatedAttendanceStatus =
        await attendanceService.getLatestAttendanceStatus(employeeId);
    }

    return res.status(200).json(logs);
  } catch (error: any) {
    console.error('Error in debug handler:', error);
    return res
      .status(500)
      .json({ message: error.message || 'Error retrieving debug logs' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ExternalDbService } from '../../services/ExternalDbService';
import { AttendanceSyncService } from '../../services/AttendanceSyncService';
import prisma from '../../lib/prisma';
import { query } from '../../utils/mysqlConnection';
import { ExternalCheckInData } from '../../types/user';
import moment from 'moment-timezone';

const attendanceService = new AttendanceService();
const externalDbService = new ExternalDbService();
const attendanceSyncService = new AttendanceSyncService();

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

    // Get user data from both internal and external databases
    logs.internalUserData = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });

    logs.externalUserData = await query<ExternalCheckInData[]>(
      'SELECT * FROM dt_user WHERE user_no = ?',
      [employeeId],
    );

    // Get attendance status
    logs.attendanceStatus =
      await attendanceService.getLatestAttendanceStatus(employeeId);

    // Get raw attendance records
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    logs.internalAttendances = await attendanceService.getAttendanceHistory(
      logs.internalUserData?.id || '',
      threeDaysAgo,
      new Date(),
    );

    // Get external attendance records
    logs.externalAttendances =
      await externalDbService.getDailyAttendanceRecords(employeeId, 3);
    logs.timeDetails = {
      rawCheckInTime: moment(logs.internalAttendances[0].checkInTime).format(),
      processedCheckInTime: moment(
        logs.attendanceStatus.latestAttendance.checkInTime,
      ).format(),
      timeZone: moment.tz.guess(),
      currentServerTime: moment().tz('Asia/Bangkok').format(),
    };

    // Simulate check-in/out if action is provided
    if (action === 'check-in' || action === 'check-out') {
      const simulatedData = {
        employeeId,
        timestamp: new Date(), // Use a Date object instead of a string
        checkType: action === 'check-in' ? 1 : 2,
        deviceSerial: 'DEBUG_DEVICE',
        isManualEntry: false,
      };

      logs.simulatedCheckInOut = simulatedData;

      // Simulate external database entry
      if (action === 'check-in') {
        await externalDbService.createCheckIn(simulatedData);
      } else {
        await externalDbService.createCheckIn({
          ...simulatedData,
          checkType: 2,
        });
      }

      // Simulate sync
      const syncType = getSyncType();
      await attendanceSyncService.syncUserAttendance(
        logs.internalUserData,
        syncType,
      );
      logs.syncType = syncType;

      // Get updated attendance status after sync
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

function getSyncType(): string {
  const currentHour = new Date().getHours();
  if (currentHour >= 5 && currentHour < 9) return 'early';
  if (currentHour >= 17 && currentHour < 24) return 'evening';
  if (currentHour >= 0 && currentHour < 5) return 'off-hours';
  return 'regular';
}

// pages/api/attendance/allowed.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../../services/AttendanceService';
import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import { HolidayService } from '../../../services/HolidayService';
import { createLeaveServiceServer } from '../../../services/LeaveServiceServer';
import { createNotificationService } from '../../../services/NotificationService';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';
import { TimeEntryService } from '../../../services/TimeEntryService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
export const notificationService = createNotificationService(prisma);
export const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const shiftService = new ShiftManagementService(prisma);

const timeEntryService = new TimeEntryService(prisma, shiftService);

const overtimeService = new OvertimeServiceServer(
  prisma,
  timeEntryService,
  notificationService,
);

shiftService.setOvertimeService(overtimeService);

const attendanceService = new AttendanceService(
  prisma,
  shiftService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
  timeEntryService,
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { employeeId, lat, lng } = req.query;

  if (
    typeof employeeId !== 'string' ||
    typeof lat !== 'string' ||
    typeof lng !== 'string'
  ) {
    return res.status(400).json({ error: 'Invalid request data' });
  }

  try {
    const location = { lat: parseFloat(lat), lng: parseFloat(lng) };
    console.log(`Received location: lat ${lat}, lng ${lng}`);
    const isAllowed = await attendanceService.isCheckInOutAllowed(
      employeeId,
      location,
    );
    res.status(200).json(isAllowed);
  } catch (error) {
    console.error('Error checking if check-in/out is allowed:', error);
    res
      .status(500)
      .json({ error: 'Failed to check if check-in/out is allowed' });
  }
}

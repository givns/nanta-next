// pages/api/attendance/allowed.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../../services/AttendanceService';
import prisma from '../../../lib/prisma';
import { ShiftManagementService } from '../../../services/ShiftManagementService';
import { HolidayService } from '../../../services/HolidayService';
import { LeaveServiceServer } from '../../../services/LeaveServiceServer';
import { OvertimeServiceServer } from '../../../services/OvertimeServiceServer';
import { NotificationService } from '../../../services/NotificationService';
import { TimeEntryService } from '../../../services/TimeEntryService';
import { OvertimeNotificationService } from '../../../services/OvertimeNotificationService';

const shiftManagementService = new ShiftManagementService(prisma);
const holidayService = new HolidayService(prisma);
const leaveServiceServer = new LeaveServiceServer();
const notificationService = new NotificationService();
const timeEntryService = new TimeEntryService(prisma);
const overtimeNotificationService = new OvertimeNotificationService();

const overtimeServiceServer = new OvertimeServiceServer(
  prisma,
  overtimeNotificationService,
  timeEntryService,
);

const attendanceService = new AttendanceService(
  prisma,
  shiftManagementService,
  holidayService,
  leaveServiceServer,
  overtimeServiceServer,
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

  const { employeeId } = req.query;

  if (typeof employeeId !== 'string') {
    return res.status(400).json({ error: 'Invalid employeeId' });
  }

  try {
    const isAllowed = await attendanceService.isCheckInOutAllowed(employeeId);
    res.status(200).json(isAllowed);
  } catch (error) {
    console.error('Error checking if check-in/out is allowed:', error);
    res
      .status(500)
      .json({ error: 'Failed to check if check-in/out is allowed' });
  }
}

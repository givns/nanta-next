import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { createNotificationService } from '@/services/NotificationService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';

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
  if (req.method === 'GET') {
    const { employeeId } = req.query;

    if (typeof employeeId !== 'string') {
      return res.status(400).json({ error: 'Invalid employeeId' });
    }

    try {
      const attendanceStatus =
        await attendanceService.getLatestAttendanceStatus(employeeId);
      res.status(200).json(attendanceStatus);
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      res.status(500).json({ error: 'Failed to fetch attendance status' });
    }
  } else if (req.method === 'POST') {
    try {
      const attendanceData = req.body;
      const result = await attendanceService.processAttendance(attendanceData);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error processing attendance:', error);
      res.status(500).json({ error: 'Failed to process attendance' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}

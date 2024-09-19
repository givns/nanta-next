import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { LeaveServiceServer } from '@/services/LeaveServiceServer';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { notificationService } from '@/services/NotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';
import { OvertimeNotificationService } from '@/services/OvertimeNotificationService';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
const leaveServiceServer = new LeaveServiceServer();
const overtimeNotificationService = new OvertimeNotificationService(); // Add this line
const shiftManagementService = new ShiftManagementService(prisma);
const timeEntryService = new TimeEntryService(prisma, shiftManagementService);
const overtimeService = new OvertimeServiceServer(
  prisma,
  overtimeNotificationService, // Add this line
  timeEntryService,
);

const attendanceService = new AttendanceService(
  prisma,
  shiftManagementService,
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

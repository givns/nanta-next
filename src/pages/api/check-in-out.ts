// pages/api/check-in-out.ts

import { PrismaClient } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { leaveServiceServer } from '@/services/LeaveServiceServer';
import { AttendanceData, AttendanceStatusInfo } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { NotificationService } from '@/services/NotificationService';
import { OvertimeNotificationService } from '@/services/OvertimeNotificationService';
import { TimeEntryService } from '@/services/TimeEntryService';
import { getBangkokTime, formatTime } from '@/utils/dateUtils';
import * as Yup from 'yup';

const prisma = new PrismaClient();
const overtimeNotificationService = new OvertimeNotificationService();
const timeEntryService = new TimeEntryService(
  prisma,
  new ShiftManagementService(prisma),
);
const overtimeService = new OvertimeServiceServer(
  prisma,
  overtimeNotificationService,
  timeEntryService,
);
const notificationService = new NotificationService();
const shiftService = new ShiftManagementService(prisma);
const holidayService = new HolidayService(prisma);

const attendanceService = new AttendanceService(
  prisma,
  shiftService,
  holidayService,
  leaveServiceServer,
  overtimeService,
  notificationService,
  timeEntryService,
);

const attendanceSchema = Yup.object().shape({
  employeeId: Yup.string().required('Employee ID is required'),
  lineUserId: Yup.string().nullable(),
  checkTime: Yup.date().required('Check time is required'),
  location: Yup.string().required('Location is required'),
  address: Yup.string().required('Address is required'),
  reason: Yup.string(),
  isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
  isLate: Yup.boolean().required('Late flag is required'),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const validatedData = await attendanceSchema.validate(req.body);
    const attendanceData: AttendanceData = {
      ...validatedData,
      lineUserId: '',
      address: '',
      isLate: false,
      location: '',
    };
    // Ensure checkTime is in the correct format
    attendanceData.checkTime = getBangkokTime().toISOString();

    const processedAttendance =
      await attendanceService.processAttendance(attendanceData);

    const updatedStatus = await attendanceService.getLatestAttendanceStatus(
      attendanceData.employeeId,
    );

    // Format times in the response
    if (updatedStatus.latestAttendance) {
      updatedStatus.latestAttendance.checkInTime = updatedStatus
        .latestAttendance.checkInTime
        ? formatTime(new Date(updatedStatus.latestAttendance.checkInTime))
        : null;
      updatedStatus.latestAttendance.checkOutTime = updatedStatus
        .latestAttendance.checkOutTime
        ? formatTime(new Date(updatedStatus.latestAttendance.checkOutTime))
        : null;
    }

    // Send notification asynchronously
    sendNotificationAsync(attendanceData, updatedStatus);

    res.status(200).json(updatedStatus);
  } catch (error: any) {
    console.error('Detailed error in check-in-out:', error);
    res
      .status(500)
      .json({ error: 'Internal server error', details: error.message });
  }
}

async function sendNotificationAsync(
  attendanceData: AttendanceData,
  updatedStatus: AttendanceStatusInfo,
) {
  try {
    const currentTime = getBangkokTime();
    if (attendanceData.isCheckIn) {
      await notificationService.sendCheckInConfirmation(
        attendanceData.employeeId,
        currentTime,
      );
    } else {
      await notificationService.sendCheckOutConfirmation(
        attendanceData.employeeId,
        currentTime,
      );
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
    // Consider implementing a retry mechanism or queueing system for failed notifications
  }
}

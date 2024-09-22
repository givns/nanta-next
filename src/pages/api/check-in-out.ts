// pages/api/check-in-out.ts

import { PrismaClient, User } from '@prisma/client';
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
import { getBangkokTime, formatTime, formatDate } from '@/utils/dateUtils';
import * as Yup from 'yup';
import { format, isValid, parse, parseISO } from 'date-fns';

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

const attendanceSchema = Yup.object()
  .shape({
    employeeId: Yup.string(),
    lineUserId: Yup.string(),
    isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
    checkTime: Yup.date().optional(),
    location: Yup.string().optional(),
    checkInAddress: Yup.string().optional(), // Make checkInAddress optional
    checkOutAddress: Yup.string().optional(),
    reason: Yup.string(),
    isOvertime: Yup.boolean().optional(), // Changed to optional
    isLate: Yup.boolean().optional(),
  })
  .test(
    'either-employeeId-or-lineUserId',
    'Either employeeId or lineUserId must be provided',
    function (value) {
      return !!value.employeeId || !!value.lineUserId;
    },
  );

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    console.log('Received data:', req.body);

    const validatedData = await attendanceSchema.validate(req.body);

    let employeeId: string;
    let user: User | null = null;

    if (validatedData.employeeId) {
      employeeId = validatedData.employeeId;
      user = await prisma.user.findUnique({
        where: { employeeId },
      });
    } else if (validatedData.lineUserId) {
      user = await prisma.user.findUnique({
        where: { lineUserId: validatedData.lineUserId },
      });
      if (user) {
        employeeId = user.employeeId;
      } else {
        return res
          .status(404)
          .json({ error: 'User not found for the given Line User ID' });
      }
    } else {
      return res
        .status(400)
        .json({ error: 'Either employeeId or lineUserId must be provided' });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = getBangkokTime();

    const attendanceData: AttendanceData = {
      employeeId,
      lineUserId: user.lineUserId,
      isCheckIn: validatedData.isCheckIn,
      checkTime: validatedData.checkTime || now.toISOString(),
      location: validatedData.location || '',
      [validatedData.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
        validatedData.isCheckIn
          ? validatedData.checkInAddress || user.departmentName || ''
          : validatedData.checkOutAddress || user.departmentName || '',
      reason: validatedData.reason || '',
      isOvertime: validatedData.isOvertime || false,
      isLate: validatedData.isLate || false,
    };
    // Ensure checkTime is in the correct format
    attendanceData.checkTime = getBangkokTime().toISOString();

    console.log('Received attendance data:', attendanceData);

    const updatedStatus = await attendanceService.getLatestAttendanceStatus(
      attendanceData.employeeId,
    );

    console.log('Updated status:', updatedStatus);

    // Format times in the response
    if (updatedStatus.latestAttendance) {
      try {
        updatedStatus.latestAttendance.checkInTime = updatedStatus
          .latestAttendance.checkInTime
          ? formatTime(new Date(updatedStatus.latestAttendance.checkInTime))
          : null;
        updatedStatus.latestAttendance.checkOutTime = updatedStatus
          .latestAttendance.checkOutTime
          ? formatTime(new Date(updatedStatus.latestAttendance.checkOutTime))
          : null;
        updatedStatus.latestAttendance.date = formatDate(
          new Date(updatedStatus.latestAttendance.date),
        );
      } catch (error: any) {
        console.error('Validation error:', error);
        console.error('Received data:', req.body);
        res.status(400).json({
          error: 'Validation error',
          details: error.errors,
          receivedData: req.body,
        });
      }
    }

    console.log('Final updated status:', updatedStatus);

    // Send notification asynchronously
    try {
      await sendNotificationAsync(attendanceData, updatedStatus);
    } catch (notificationError) {
      console.error('Failed to send notification:', notificationError);
      // We'll continue even if notification fails
    }

    res.status(200).json(updatedStatus);
  } catch (error: any) {
    console.error('Detailed error in check-in-out:', error);
    console.error('Received data:', req.body); // Add this line
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      receivedData: req.body,
    });
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

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
import { getBangkokTime, formatTime, formatDate } from '@/utils/dateUtils';
import * as Yup from 'yup';
import { format, isValid, parseISO } from 'date-fns';

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
  checkInAddress: Yup.string().when('isCheckIn', (isCheckIn, schema) => {
    return isCheckIn ? schema.required('Check-in address is required') : schema;
  }),
  checkOutAddress: Yup.string().when('isCheckIn', (isCheckIn, schema) => {
    return isCheckIn
      ? schema
      : schema.required('Check-out address is required');
  }),
  reason: Yup.string(),
  isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
  isOvertime: Yup.boolean().required('Overtime flag is required'),
  isLate: Yup.boolean().optional(),
});

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
    const attendanceData: AttendanceData = {
      ...validatedData,
      lineUserId: '',
      checkTime: getBangkokTime().toISOString(), // Parse the ISO string to a Date object
      isLate: validatedData.isLate ?? false, // Provide a default value of false if isLate is undefined
      [validatedData.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
        validatedData.isCheckIn
          ? validatedData.checkInAddress
          : validatedData.checkOutAddress,
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
      } catch (formatError) {
        console.error('Error formatting times:', formatError);
        // If there's an error formatting, we'll leave the original values
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

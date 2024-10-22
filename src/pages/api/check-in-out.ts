// pages/api/check-in-out.ts

import { PrismaClient, Prisma } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';
import { AttendanceService } from '../../services/AttendanceService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { AttendanceData, AttendanceStatusInfo } from '@/types/attendance';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { createNotificationService } from '../../services/NotificationService';
import { createLeaveServiceServer } from '../../services/LeaveServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import {
  formatTime,
  formatDate,
  getCurrentTime,
  formatDateTime,
} from '@/utils/dateUtils';
import * as Yup from 'yup';
import BetterQueue from 'better-queue';
import MemoryStore from 'better-queue-memory';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

const prisma = new PrismaClient();
const holidayService = new HolidayService(prisma);
export const notificationService = createNotificationService(prisma);
export const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const shiftService = new ShiftManagementService(prisma);

const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
);

const overtimeService = new OvertimeServiceServer(
  prisma,
  holidayService,
  leaveServiceServer,
  shiftService,
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

const attendanceSchema = Yup.object()
  .shape({
    employeeId: Yup.string(),
    lineUserId: Yup.string(),
    isCheckIn: Yup.boolean().required('Check-in/out flag is required'),
    checkTime: Yup.date().optional(),
    location: Yup.string().optional(),
    checkInAddress: Yup.string().optional(),
    checkOutAddress: Yup.string().optional(),
    reason: Yup.string(),
    isOvertime: Yup.boolean().optional(),
    isLate: Yup.boolean().optional(),
  })
  .test(
    'either-employeeId-or-lineUserId',
    'Either employeeId or lineUserId must be provided',
    (value) => Boolean(value.employeeId || value.lineUserId),
  );

interface QueueTask extends AttendanceData {
  inPremises: boolean;
  address: string;
}

function validateUpdatedStatus(status: any): boolean {
  if (!status || typeof status !== 'object') return false;
  if (!status.latestAttendance || typeof status.latestAttendance !== 'object')
    return false;
  return true;
}

const checkInOutQueue = new BetterQueue(
  async (task, cb) => {
    try {
      const result = await processCheckInOut(task);
      cb(null, result);
    } catch (error) {
      cb(error);
    }
  },
  {
    concurrent: 5,
    store: new MemoryStore(),
  },
);

async function processCheckInOut(
  data: QueueTask,
): Promise<AttendanceStatusInfo> {
  try {
    const validatedData = await attendanceSchema.validate(data);

    const user = validatedData.employeeId
      ? await prisma.user.findUnique({
          where: { employeeId: validatedData.employeeId },
        })
      : await prisma.user.findUnique({
          where: { lineUserId: validatedData.lineUserId },
        });

    if (!user) {
      throw new Error('User not found');
    }

    const now = getCurrentTime();
    const attendanceData: AttendanceData = {
      employeeId: user.employeeId,
      lineUserId: user.lineUserId,
      isCheckIn: validatedData.isCheckIn,
      checkTime: (validatedData.checkTime || now).toISOString(),
      location: validatedData.location || '',
      [validatedData.isCheckIn ? 'checkInAddress' : 'checkOutAddress']:
        validatedData.isCheckIn
          ? validatedData.checkInAddress || user.departmentName || ''
          : validatedData.checkOutAddress || user.departmentName || '',
      reason: validatedData.reason || '',
      isOvertime: validatedData.isOvertime || false,
      isLate: validatedData.isLate || false,
    };

    // Process attendance
    const processedAttendance =
      await attendanceService.processAttendance(attendanceData);
    if (!processedAttendance) {
      throw new Error('Failed to process attendance');
    }

    // Process overtime if needed
    if (attendanceData.isOvertime) {
      await attendanceService.processCheckInOut(
        user.employeeId,
        new Date(attendanceData.checkTime),
        attendanceData.isCheckIn,
        true,
      );
    }

    // Get updated status
    const updatedStatus = await attendanceService.getLatestAttendanceStatus(
      attendanceData.employeeId,
    );

    // Format times for response
    if (updatedStatus.latestAttendance) {
      if (updatedStatus.latestAttendance.checkInTime) {
        updatedStatus.latestAttendance.checkInTime = formatTime(
          updatedStatus.latestAttendance.checkInTime,
        );
      }
      if (updatedStatus.latestAttendance.checkOutTime) {
        updatedStatus.latestAttendance.checkOutTime = formatTime(
          updatedStatus.latestAttendance.checkOutTime,
        );
      }
      updatedStatus.latestAttendance.date = formatDate(
        new Date(updatedStatus.latestAttendance.date),
      );
    }

    // Send notification asynchronously
    sendNotificationAsync(attendanceData, updatedStatus).catch(console.error);

    return updatedStatus;
  } catch (error: any) {
    console.error('Error in processCheckInOut:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2023') {
        throw new Error('Invalid attendance record format. Please try again.');
      }
    }
    throw error;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const now = getCurrentTime();
    console.log(
      `Processing check-in/out at: ${formatDateTime(now, 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log('Received data:', JSON.stringify(req.body));

    // Wrap the queue push in a promise to handle asynchronous errors
    const queueResult = await new Promise((resolve, reject) => {
      checkInOutQueue.push(req.body, (err: Error | null, result: any) => {
        if (err) {
          console.error('Error in queue processing:', err);
          console.error('Error stack:', err.stack);
          reject(err);
        } else {
          console.log('Queue processing completed successfully');
          resolve(result);
        }
      });
    });

    if (!validateUpdatedStatus(queueResult)) {
      throw new Error(
        'Invalid attendance status format returned from processing',
      );
    }

    console.log(
      'Check-in/out processed successfully:',
      JSON.stringify(queueResult),
    );
    res.status(200).json(queueResult);
  } catch (error: any) {
    console.error('Detailed error in check-in-out:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      code:
        error instanceof Prisma.PrismaClientKnownRequestError
          ? error.code
          : undefined,
    });
  }
}
async function sendNotificationAsync(
  attendanceData: AttendanceData,
  updatedStatus: AttendanceStatusInfo,
) {
  try {
    const currentTime = getCurrentTime();
    console.log(
      `Attempting to send notification for employee ${attendanceData.employeeId}`,
    );
    console.log(`Notification data:`, JSON.stringify(attendanceData));

    if (!attendanceData.lineUserId) {
      console.log('Line user ID is null, skipping notification');
      return;
    }

    let success = false;

    if (attendanceData.isCheckIn) {
      try {
        await notificationService.sendCheckInConfirmation(
          attendanceData.employeeId,
          attendanceData.lineUserId,
          new Date(attendanceData.checkTime),
        );
        success = true;
      } catch (error) {
        console.error('Error sending check-in confirmation:', error);
      }
    } else {
      try {
        await notificationService.sendCheckOutConfirmation(
          attendanceData.employeeId,
          attendanceData.lineUserId,
          new Date(attendanceData.checkTime),
        );
        success = true;
      } catch (error) {
        console.error('Error sending check-out confirmation:', error);
      }
    }

    if (!success) {
      // Fallback to direct sendNotification call
      const formattedDateTime = format(
        new Date(attendanceData.checkTime),
        'dd MMMM yyyy เวลา HH:mm น.',
        { locale: th },
      );
      const message = attendanceData.isCheckIn
        ? `${attendanceData.employeeId} ลงเวลาเข้างานเมื่อ ${formattedDateTime}`
        : `${attendanceData.employeeId} ลงเวลาออกงานเมื่อ ${formattedDateTime}`;

      const type = attendanceData.isCheckIn ? 'check-in' : 'check-out';

      success = await notificationService.sendNotification(
        attendanceData.employeeId,
        attendanceData.lineUserId,
        message,
        type,
      );
    }

    if (success) {
      console.log(
        `${attendanceData.isCheckIn ? 'Check-in' : 'Check-out'} notification sent for employee ${attendanceData.employeeId}`,
      );
    } else {
      console.log(
        `Failed to send ${attendanceData.isCheckIn ? 'check-in' : 'check-out'} notification for employee ${attendanceData.employeeId}`,
      );
    }
  } catch (error: any) {
    console.error('Failed to send notification:', error);
    console.error('Error stack:', error.stack);
  }
}

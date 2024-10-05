//api/attendance-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/AttendanceService';
import { HolidayService } from '@/services/HolidayService';
import { ShiftManagementService } from '@/services/ShiftManagementService';
import { OvertimeServiceServer } from '@/services/OvertimeServiceServer';
import { TimeEntryService } from '@/services/TimeEntryService';
import { createLeaveServiceServer } from '@/services/LeaveServiceServer';
import { createNotificationService } from '@/services/NotificationService';
import { cacheService } from '@/services/CacheService';
import { ResponseDataSchema } from '../../schemas/attendance';

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
  const { employeeId, lineUserId, lat, lng, forceRefresh } = req.query;

  console.log('Request params:', {
    employeeId,
    lineUserId,
    lat,
    lng,
    forceRefresh,
  });

  try {
    let user;
    if (lineUserId && typeof lineUserId === 'string') {
      user = await prisma.user.findUnique({ where: { lineUserId } });
    } else {
      user = await prisma.user.findUnique({
        where: { employeeId: employeeId as string },
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User found:', user.employeeId);
    let responseData;

    if (cacheService && !forceRefresh) {
      console.log('Attempting to fetch from cache');
      responseData = await cacheService.getWithSWR(
        `attendance-status:${user.employeeId}`,
        async () => {
          console.log('Cache miss, fetching fresh data');
          const [shiftData, attendanceStatus, approvedOvertime] =
            await Promise.all([
              shiftService.getEffectiveShiftAndStatus(
                user.employeeId,
                new Date(),
              ),
              attendanceService.getLatestAttendanceStatus(user.employeeId),
              overtimeService.getApprovedOvertimeRequest(
                user.employeeId,
                new Date(),
              ),
            ]);

          return { shiftData, attendanceStatus, approvedOvertime };
        },
        300, // 5 minutes TTL
      );
      if (responseData) {
        console.log(`Cache hit for key: ${user.employeeId}`);
      }
    } else {
      console.log('Fetching fresh data');
      const [shiftData, attendanceStatus, approvedOvertime] = await Promise.all(
        [
          shiftService.getEffectiveShiftAndStatus(user.employeeId, new Date()),
          attendanceService.getLatestAttendanceStatus(user.employeeId),
          overtimeService.getApprovedOvertimeRequest(
            user.employeeId,
            new Date(),
          ),
        ],
      );

      responseData = { shiftData, attendanceStatus, approvedOvertime };
    }

    console.log('ResponseData:', JSON.stringify(responseData, null, 2));

    // Always fetch fresh check-in/out allowance
    const checkInOutAllowance =
      lat && lng
        ? await attendanceService.isCheckInOutAllowed(user.employeeId, {
            lat: parseFloat(lat as string),
            lng: parseFloat(lng as string),
          })
        : { allowed: true, reason: 'Location not provided' };

    console.log('CheckInOutAllowance:', checkInOutAllowance);

    const finalResponseData = {
      user,
      attendanceStatus: responseData?.attendanceStatus,
      effectiveShift: responseData?.shiftData?.effectiveShift,
      checkInOutAllowance,
      approvedOvertime: responseData?.approvedOvertime,
    };

    console.log(
      'FinalResponseData:',
      JSON.stringify(finalResponseData, null, 2),
    );

    const parsedResponseData = ResponseDataSchema.parse(finalResponseData);
    res.status(200).json(parsedResponseData);
  } catch (error: any) {
    console.error('Detailed error in attendance-status API:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      stack: error.stack,
    });
  }
}

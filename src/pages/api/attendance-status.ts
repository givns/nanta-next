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

  if (
    (!employeeId && !lineUserId) ||
    (employeeId && typeof employeeId !== 'string') ||
    (lineUserId && typeof lineUserId !== 'string')
  ) {
    return res
      .status(400)
      .json({ error: 'Missing or invalid employeeId or lineUserId parameter' });
  }

  let latitude: number | undefined;
  let longitude: number | undefined;

  if (lat && lng) {
    latitude = parseFloat(lat as string);
    longitude = parseFloat(lng as string);

    if (isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({ error: 'Invalid latitude or longitude' });
    }
  }

  try {
    let user;
    if (lineUserId) {
      user = await prisma.user.findUnique({ where: { lineUserId } });
    } else {
      user = await prisma.user.findUnique({
        where: { employeeId: employeeId as string },
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const cacheKey = `attendance-status:${user.employeeId}`;
    let responseData;

    if (cacheService && !forceRefresh) {
      responseData = await cacheService.getWithSWR(
        cacheKey,
        async () => {
          console.log(`Cache miss for key: ${cacheKey}`);
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
        console.log(`Cache hit for key: ${cacheKey}`);
      } else {
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

        responseData = { shiftData, attendanceStatus, approvedOvertime };
      }
    }
    // Always fetch fresh check-in/out allowance
    const checkInOutAllowance =
      lat && lng
        ? await attendanceService.isCheckInOutAllowed(user.employeeId, {
            lat: parseFloat(lat as string),
            lng: parseFloat(lng as string),
          })
        : { allowed: true, reason: 'Location not provided' };

    responseData.checkInOutAllowance = checkInOutAllowance;

    const finalResponseData = {
      user,
      attendanceStatus: responseData.attendanceStatus,
      effectiveShift: responseData.shiftData.effectiveShift,
      checkInOutAllowance,
      approvedOvertime: responseData.approvedOvertime,
    };

    const parsedResponseData = ResponseDataSchema.parse(finalResponseData);
    res.status(200).json(parsedResponseData);
  } catch (error) {
    console.error('Error fetching attendance status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

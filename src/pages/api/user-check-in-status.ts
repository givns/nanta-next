//api/user-check-in-status.ts
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

  const { lineUserId, lat, lng } = req.query;

  if (!lineUserId || typeof lineUserId !== 'string') {
    return res
      .status(400)
      .json({ error: 'Missing or invalid lineUserId parameter' });
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

  console.log(`Received location: lat ${latitude}, lng ${longitude}`);

  try {
    const cacheKey = `user-status:${lineUserId}`;
    let responseData;

    if (cacheService) {
      responseData = await cacheService.getWithSWR(
        cacheKey,
        async () => {
          const user = await prisma.user.findUnique({ where: { lineUserId } });
          if (!user) throw new Error('User not found');

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

          return { user, shiftData, attendanceStatus, approvedOvertime };
        },
        300, // 5 minutes TTL
      );
    } else {
      // Fallback to fetching fresh data if cacheService is not available
      const user = await prisma.user.findUnique({
        where: { lineUserId },
        include: { department: true, potentialOvertimes: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const today = new Date();

      const [shiftData, attendanceStatus, approvedOvertime] = await Promise.all(
        [
          shiftService.getEffectiveShiftAndStatus(user.employeeId, today),
          attendanceService.getLatestAttendanceStatus(user.employeeId),
          overtimeService.getApprovedOvertimeRequest(user.employeeId, today),
        ],
      );

      responseData = { user, shiftData, attendanceStatus, approvedOvertime };
    }

    // Always fetch fresh check-in/out allowance
    const checkInOutAllowance =
      latitude !== undefined && longitude !== undefined
        ? await attendanceService.isCheckInOutAllowed(
            responseData.user.employeeId,
            { lat: latitude, lng: longitude },
          )
        : { allowed: true, reason: 'Location not provided' };

    responseData.checkInOutAllowance = checkInOutAllowance;

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Unexpected error in user check-in status:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message,
    });
  }
}

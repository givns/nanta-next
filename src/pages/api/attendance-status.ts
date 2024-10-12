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
  const { employeeId, lineUserId, inPremises, address, forceRefresh } =
    req.query;

  console.log('Request params:', {
    employeeId,
    lineUserId,
    inPremises,
    address,
    forceRefresh,
  });

  try {
    let user;
    if (lineUserId && typeof lineUserId === 'string') {
      const cacheKey = `user:${lineUserId}`;
      if (cacheService) {
        user = await cacheService.get(cacheKey);
      }
      if (!user) {
        user = await prisma.user.findUnique({ where: { lineUserId } });
        if (user) {
          if (cacheService) {
            // Add null check for cacheService
            await cacheService.set(cacheKey, JSON.stringify(user), 3600); // Cache for 1 hour
          }
        }
      } else {
        user = JSON.parse(user);
      }
    } else if (employeeId && typeof employeeId === 'string') {
      user = await prisma.user.findUnique({ where: { employeeId } });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User found:', user);

    const cacheKey = `attendance-status:${user.lineUserId || user.employeeId}`;

    let responseData;
    if (cacheService && !forceRefresh) {
      console.log('Attempting to fetch from cache');
      responseData = await cacheService.getWithSWR(
        cacheKey,
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
        console.log(`Cache hit for key: ${cacheKey}`);
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
    const checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
      user.employeeId,
      inPremises === 'true',
      address as string,
    );

    console.log('CheckInOutAllowance:', checkInOutAllowance);

    const finalResponseData = {
      user,
      attendanceStatus: {
        ...responseData?.attendanceStatus,
        overtimeDuration: isNaN(
          responseData?.attendanceStatus?.overtimeDuration,
        )
          ? 0
          : responseData?.attendanceStatus?.overtimeDuration,
        approvedOvertime: responseData?.attendanceStatus?.approvedOvertime
          ? {
              ...responseData.attendanceStatus.approvedOvertime,
              date:
                typeof responseData.attendanceStatus.approvedOvertime.date ===
                'string'
                  ? responseData.attendanceStatus.approvedOvertime.date
                  : responseData.attendanceStatus.approvedOvertime
                        .date instanceof Date
                    ? responseData.attendanceStatus.approvedOvertime.date.toISOString()
                    : new Date().toISOString(), // Fallback to current date if invalid
              startTime:
                responseData.attendanceStatus.approvedOvertime.startTime || '',
              endTime:
                responseData.attendanceStatus.approvedOvertime.endTime || '',
              approvedAt: responseData.attendanceStatus.approvedOvertime
                .approvedAt
                ? new Date(
                    responseData.attendanceStatus.approvedOvertime.approvedAt,
                  ).toISOString()
                : null,
            }
          : null,
      },
      effectiveShift: responseData?.shiftData?.effectiveShift,
      checkInOutAllowance,
      approvedOvertime: responseData?.approvedOvertime
        ? {
            ...responseData.approvedOvertime,
            date:
              typeof responseData.approvedOvertime.date === 'string'
                ? responseData.approvedOvertime.date
                : responseData.approvedOvertime.date instanceof Date
                  ? responseData.approvedOvertime.date.toISOString()
                  : new Date().toISOString(), // Fallback to current date if invalid
            startTime: responseData.approvedOvertime.startTime || '',
            endTime: responseData.approvedOvertime.endTime || '',
            approvedAt: responseData.approvedOvertime.approvedAt
              ? new Date(responseData.approvedOvertime.approvedAt).toISOString()
              : null,
          }
        : null,
    };

    console.log(
      'FinalResponseData before parsing:',
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

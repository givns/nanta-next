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
import { approveLeaveRequest } from '@/services/api';

const prisma = new PrismaClient();

// Initialize services
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const shiftService = new ShiftManagementService(prisma);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const timeEntryService = new TimeEntryService(prisma, shiftService);

// Initialize OvertimeServiceServer with new dependencies
const overtimeService = new OvertimeServiceServer(
  prisma,
  holidayService,
  leaveServiceServer,
  shiftService,
  timeEntryService,
  notificationService,
);

// Set overtime service in shift service if needed
shiftService.setOvertimeService(overtimeService);

// Initialize AttendanceService
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
      req.query.inPremises === 'true',
      req.query.address as string,
    );

    console.log('CheckInOutAllowance:', checkInOutAllowance);

    const finalResponseData = {
      user,
      attendanceStatus: responseData?.attendanceStatus,
      effectiveShift: responseData?.shiftData?.effectiveShift,
      checkInOutAllowance,
      approvedOvertime: responseData?.approvedOvertime,
      approveLeaveRequest: approveLeaveRequest,
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

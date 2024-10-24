// pages/api/attendance-status.ts
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
import { ZodError, z } from 'zod';

const prisma = new PrismaClient();

// Initialize services
const holidayService = new HolidayService(prisma);
const notificationService = createNotificationService(prisma);
const shiftService = new ShiftManagementService(prisma, holidayService);
const leaveServiceServer = createLeaveServiceServer(
  prisma,
  notificationService,
);
const timeEntryService = new TimeEntryService(
  prisma,
  shiftService,
  notificationService,
);

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

interface LeaveRequestWithDates {
  id: string;
  employeeId: string;
  leaveType: string;
  leaveFormat: string;
  reason: string;
  startDate: Date | string;
  endDate: Date | string;
  fullDayCount: number;
  status: string;
  approverId?: string | null;
  denierId?: string | null;
  denialReason?: string | null;
  resubmitted?: boolean;
  originalRequestId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    // Fetch user data
    let user;
    if (lineUserId && typeof lineUserId === 'string') {
      const cacheKey = `user:${lineUserId}`;
      if (cacheService) {
        user = await cacheService.get(cacheKey);
        if (user) {
          user = JSON.parse(user);
        }
      }
      if (!user) {
        user = await prisma.user.findUnique({
          where: { lineUserId },
          include: {
            department: true,
          },
        });
        if (user && cacheService) {
          await cacheService.set(cacheKey, JSON.stringify(user), 3600);
        }
      }
    } else if (employeeId && typeof employeeId === 'string') {
      user = await prisma.user.findUnique({
        where: { employeeId },
        include: {
          department: true,
        },
      });
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('User found:', user);

    // Fetch attendance data
    const cacheKey = `attendance-status:${user.lineUserId || user.employeeId}`;
    let responseData;

    try {
      if (cacheService && !forceRefresh) {
        console.log('Attempting to fetch from cache');
        responseData = await cacheService.getWithSWR(
          cacheKey,
          async () => {
            console.log('Cache miss, fetching fresh data');
            const [
              shiftData,
              attendanceStatus,
              approvedOvertime,
              leaveRequests,
            ] = await Promise.all([
              shiftService.getEffectiveShiftAndStatus(
                user.employeeId,
                new Date(),
              ),
              attendanceService.getLatestAttendanceStatus(user.employeeId),
              overtimeService.getApprovedOvertimeRequest(
                user.employeeId,
                new Date(),
              ),
              leaveServiceServer.getLeaveRequests(user.employeeId),
            ]);

            return {
              shiftData,
              attendanceStatus,
              approvedOvertime,
              leaveRequests,
            };
          },
          300,
        );
        if (responseData) {
          console.log(`Cache hit for key: ${cacheKey}`);
        }
      } else {
        console.log('Fetching fresh data');
        const [shiftData, attendanceStatus, approvedOvertime, leaveRequests] =
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
            leaveServiceServer.getLeaveRequests(user.employeeId),
          ]);

        responseData = {
          shiftData,
          attendanceStatus,
          approvedOvertime,
          leaveRequests,
        };
      }
    } catch (error) {
      console.error('Error fetching attendance data:', error);
      return res.status(500).json({
        error: 'Failed to fetch attendance data',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fetch check-in/out allowance
    let checkInOutAllowance;
    try {
      checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
        user.employeeId,
        req.query.inPremises === 'true',
        req.query.address as string,
      );
    } catch (error) {
      console.error('Error fetching check-in/out allowance:', error);
      return res.status(500).json({
        error: 'Failed to fetch check-in/out allowance',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Prepare final response
    try {
      const finalResponseData = {
        user: {
          ...user,
          updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
        },
        attendanceStatus: responseData?.attendanceStatus
          ? {
              ...responseData.attendanceStatus,
              approvedOvertime: responseData.attendanceStatus.approvedOvertime
                ? {
                    ...responseData.attendanceStatus.approvedOvertime,
                    date: new Date(
                      responseData.attendanceStatus.approvedOvertime.date,
                    ),
                    actualStartTime: responseData.attendanceStatus
                      .approvedOvertime.actualStartTime
                      ? new Date(
                          responseData.attendanceStatus.approvedOvertime.actualStartTime,
                        )
                      : null,
                    actualEndTime: responseData.attendanceStatus
                      .approvedOvertime.actualEndTime
                      ? new Date(
                          responseData.attendanceStatus.approvedOvertime.actualEndTime,
                        )
                      : null,
                    approvedAt: responseData.attendanceStatus.approvedOvertime
                      .approvedAt
                      ? new Date(
                          responseData.attendanceStatus.approvedOvertime.approvedAt,
                        )
                      : null,
                    updatedAt: responseData.attendanceStatus.approvedOvertime
                      .updatedAt
                      ? new Date(
                          responseData.attendanceStatus.approvedOvertime.updatedAt,
                        )
                      : undefined,
                  }
                : null,
            }
          : null,
        effectiveShift: responseData?.shiftData?.effectiveShift,
        checkInOutAllowance,
        approvedOvertime: responseData?.approvedOvertime
          ? {
              ...responseData.approvedOvertime,
              date: new Date(responseData.approvedOvertime.date),
              actualStartTime: responseData.approvedOvertime.actualStartTime
                ? new Date(responseData.approvedOvertime.actualStartTime)
                : null,
              actualEndTime: responseData.approvedOvertime.actualEndTime
                ? new Date(responseData.approvedOvertime.actualEndTime)
                : null,
              approvedAt: responseData.approvedOvertime.approvedAt
                ? new Date(responseData.approvedOvertime.approvedAt)
                : null,
            }
          : null,
        leaveRequests:
          responseData?.leaveRequests?.map(
            (request: LeaveRequestWithDates) => ({
              ...request,
              startDate: new Date(request.startDate),
              endDate: new Date(request.endDate),
            }),
          ) ?? [],
      };

      const validatedData = ResponseDataSchema.parse(finalResponseData);
      return res.status(200).json(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(
          'Validation Error:',
          JSON.stringify(error.errors, null, 2),
        );
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map((err) => ({
            path: err.path.join('.'),
            message: err.message,
          })),
        });
      }
      throw error; // Re-throw unexpected errors
    }
  } catch (error) {
    console.error('Unexpected error in attendance-status API:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  }
}

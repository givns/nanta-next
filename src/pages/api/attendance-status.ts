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
import { AttendanceStatusInfo } from '@/types/attendance';

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

const prepareUserData = (user: any) => {
  // Ensure all required fields are present with default values if needed
  return {
    id: user.id || user.employeeId, // Use employeeId as fallback for id
    employeeId: user.employeeId,
    name: user.name,
    lineUserId: user.lineUserId,
    nickname: user.nickname,
    departmentId: user.departmentId,
    departmentName: user.departmentName || user.department?.name || '',
    role: user.role,
    company: user.company || 'default', // Provide default value
    employeeType: user.employeeType || 'Fulltime', // Default to Fulltime
    isGovernmentRegistered: user.isGovernmentRegistered || 'false', // Default to 'false'
    profilePictureUrl: user.profilePictureUrl,
    shiftId: user.shiftId,
    shiftCode: user.shiftCode,
    overtimeHours: user.overtimeHours || 0,
    sickLeaveBalance: user.sickLeaveBalance || 0,
    businessLeaveBalance: user.businessLeaveBalance || 0,
    annualLeaveBalance: user.annualLeaveBalance || 0,
    isPreImported: user.isPreImported || 'false', // Default to 'false'
    isRegistrationComplete: user.isRegistrationComplete || 'true', // Default to 'true'
    updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { employeeId, lineUserId, inPremises, address, forceRefresh } =
    req.query;

  console.log('Attendance Status API Request:', {
    employeeId,
    lineUserId,
    inPremises,
    address,
    forceRefresh,
    timestamp: new Date().toISOString(),
  });

  try {
    // Fetch user data with better error handling
    let user;
    try {
      if (lineUserId && typeof lineUserId === 'string') {
        const cacheKey = `user:${lineUserId}`;
        if (cacheService) {
          const cachedUser = await cacheService.get(cacheKey);
          if (cachedUser) {
            user = JSON.parse(cachedUser);
          }
        }
        if (!user) {
          user = await prisma.user.findUnique({
            where: { lineUserId },
            include: { department: true },
          });
          if (user && cacheService) {
            await cacheService.set(cacheKey, JSON.stringify(user), 3600);
          }
        }
      } else if (employeeId && typeof employeeId === 'string') {
        user = await prisma.user.findUnique({
          where: { employeeId },
          include: { department: true },
        });
      }

      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'Please complete your registration first.',
        });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({
        error: 'Failed to fetch user data',
        message: 'Unable to retrieve user information. Please try again.',
      });
    }

    // Prepare user data with all required fields
    const preparedUser = prepareUserData(user);

    // Create default/initial attendance status for new users
    const createInitialAttendanceStatus = async (
      userId: string,
    ): Promise<AttendanceStatusInfo> => {
      const now = new Date();
      const currentShift = await shiftService.getEffectiveShiftAndStatus(
        userId,
        now,
      );

      return {
        isDayOff: !currentShift?.effectiveShift?.workDays.includes(
          now.getDay(),
        ),
        isHoliday: false,
        holidayInfo: null,
        dayOffType: 'none',
        status: 'absent',
        isCheckingIn: true,
        isOvertime: false,
        overtimeDuration: 0,
        overtimeEntries: [],
        detailedStatus: 'first-time',
        isEarlyCheckIn: false,
        isLateCheckIn: false,
        isLateCheckOut: false,
        user: {
          ...preparedUser,
          updatedAt: preparedUser.updatedAt ?? undefined,
        },
        latestAttendance: null,
        shiftAdjustment: null,
        approvedOvertime: null,
        futureShifts: [],
        futureOvertimes: [],
        pendingLeaveRequest: false,
      };
    };

    // Fetch attendance data with cache and fallback
    const cacheKey = `attendance-status:${user.lineUserId || user.employeeId}`;
    let responseData;

    try {
      if (cacheService && !forceRefresh) {
        console.log('Attempting to fetch from cache');
        responseData = await cacheService.getWithSWR(
          cacheKey,
          async () => {
            console.log('Cache miss, fetching fresh data');
            try {
              const [
                shiftData,
                attendanceStatus,
                approvedOvertime,
                leaveRequests,
              ] = await Promise.all([
                shiftService.getEffectiveShiftAndStatus(
                  preparedUser.employeeId,
                  new Date(),
                ),
                attendanceService
                  .getLatestAttendanceStatus(preparedUser.employeeId)
                  .catch(async (error) => {
                    console.log(
                      'No existing attendance found, creating initial status',
                    );
                    return createInitialAttendanceStatus(
                      preparedUser.employeeId,
                    );
                  }),
                overtimeService
                  .getApprovedOvertimeRequest(
                    preparedUser.employeeId,
                    new Date(),
                  )
                  .catch(() => null),
                leaveServiceServer
                  .getLeaveRequests(preparedUser.employeeId)
                  .catch(() => []),
              ]);

              console.log('Data fetched successfully:', {
                hasShiftData: !!shiftData,
                hasAttendanceStatus: !!attendanceStatus,
                hasOvertime: !!approvedOvertime,
                leaveRequestCount: leaveRequests.length,
              });

              return {
                shiftData,
                attendanceStatus,
                approvedOvertime,
                leaveRequests,
              };
            } catch (error) {
              console.error('Error fetching attendance data:', error);
              // Return minimal data structure for new users
              const defaultShiftData =
                await shiftService.getEffectiveShiftAndStatus(
                  preparedUser.employeeId,
                  new Date(),
                );

              return {
                shiftData: defaultShiftData,
                attendanceStatus: await createInitialAttendanceStatus(
                  preparedUser.employeeId,
                ),
                approvedOvertime: null,
                leaveRequests: [],
              };
            }
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
              preparedUser.employeeId,
              new Date(),
            ),
            attendanceService.getLatestAttendanceStatus(
              preparedUser.employeeId,
            ),
            overtimeService.getApprovedOvertimeRequest(
              preparedUser.employeeId,
              new Date(),
            ),
            leaveServiceServer.getLeaveRequests(preparedUser.employeeId),
          ]);

        responseData = {
          shiftData,
          attendanceStatus,
          approvedOvertime,
          leaveRequests,
        };
      }
    } catch (error) {
      console.error('Error in data fetching:', error);
      // Return minimal valid response
      responseData = {
        shiftData: await shiftService.getEffectiveShiftAndStatus(
          preparedUser.employeeId,
          new Date(),
        ),
        attendanceStatus: await createInitialAttendanceStatus(
          preparedUser.employeeId,
        ),
        approvedOvertime: null,
        leaveRequests: [],
      };
    }

    // Fetch check-in/out allowance
    const checkInOutAllowance = await attendanceService
      .isCheckInOutAllowed(
        preparedUser.employeeId,
        req.query.inPremises === 'true',
        req.query.address as string,
      )
      .catch(() => ({
        allowed: false,
        reason: 'Unable to determine check-in/out permissions',
        inPremises: false,
        address: '',
        isAfternoonShift: false,
        isLateCheckIn: false,
        isLate: false,
        isOvertime: false,
        isEarlyCheckOut: false,
        requireConfirmation: false,
      }));

    // Prepare final response
    // Prepare final response with fallbacks
    const finalResponseData = {
      user: preparedUser,
      attendanceStatus: responseData.attendanceStatus,
      effectiveShift: responseData.shiftData?.effectiveShift,
      checkInOutAllowance,
      approvedOvertime: responseData.approvedOvertime,
      leaveRequests: responseData.leaveRequests ?? [],
    };

    console.log('Final Response Summary:', {
      userEmployeeId: preparedUser.employeeId,
      hasAttendanceStatus: !!responseData.attendanceStatus,
      hasEffectiveShift: !!responseData.shiftData?.effectiveShift,
      checkInOutAllowed: checkInOutAllowance.allowed,
      hasApprovedOvertime: !!responseData.approvedOvertime,
      leaveRequestsCount: responseData.leaveRequests?.length ?? 0,
    });

    try {
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
            code: err.code,
          })),
        });
      }
      throw error;
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

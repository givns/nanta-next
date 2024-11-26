// pages/api/attendance-status.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { AttendanceService } from '../../services/Attendance/AttendanceService';
import { cacheService } from '../../services/CacheService';
import { ResponseDataSchema } from '../../schemas/attendance';
import {
  AppError,
  ErrorCode,
  CheckStatus,
  PeriodType,
} from '../../types/attendance';
import { initializeServices } from '../../services/ServiceInitializer';
import { get } from 'lodash';
import { getCurrentTime } from '@/utils/dateUtils';

// Initialize services
const prisma = new PrismaClient();
const services = initializeServices(prisma);
const attendanceService = new AttendanceService(
  prisma,
  services.shiftService,
  services.holidayService,
  services.leaveService,
  services.overtimeService,
  services.notificationService,
  services.timeEntryService,
);

// User Data Preparation
const prepareUserData = (user: any) => {
  return {
    id: user.id || user.employeeId,
    employeeId: user.employeeId,
    name: user.name,
    lineUserId: user.lineUserId,
    nickname: user.nickname ?? null,
    departmentId: user.departmentId,
    departmentName: user.departmentName || user.department?.name || '',
    role: user.role,
    company: user.company || 'default',
    employeeType: user.employeeType || 'Fulltime',
    isGovernmentRegistered: user.isGovernmentRegistered || 'false',
    profilePictureUrl: user.profilePictureUrl,
    shiftId: user.shiftId,
    shiftCode: user.shiftCode,
    overtimeHours: user.overtimeHours || 0,
    sickLeaveBalance: user.sickLeaveBalance || 0,
    businessLeaveBalance: user.businessLeaveBalance || 0,
    annualLeaveBalance: user.annualLeaveBalance || 0,
    isPreImported: user.isPreImported || 'false',
    isRegistrationComplete: user.isRegistrationComplete || 'true',
    updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
  };
};

// Main API Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

  const { employeeId, lineUserId, inPremises, address, forceRefresh } =
    req.query;

  try {
    // User Data Fetching
    let user = await (async () => {
      if (lineUserId && typeof lineUserId === 'string') {
        const cacheKey = `user:${lineUserId}`;
        const cachedUser = cacheService
          ? await cacheService.get(cacheKey)
          : null;

        if (cachedUser) {
          return JSON.parse(cachedUser);
        }

        const user = await prisma.user.findUnique({
          where: { lineUserId },
          include: { department: true },
        });

        if (user && cacheService) {
          await cacheService.set(cacheKey, JSON.stringify(user), 3600);
        }

        return user;
      }

      if (employeeId && typeof employeeId === 'string') {
        return prisma.user.findUnique({
          where: { employeeId },
          include: { department: true },
        });
      }

      return null;
    })();

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Please complete your registration first.',
      });
    }

    const preparedUser = prepareUserData(user);
    const currentTime = getCurrentTime();
    console.log('Current time in attendance-status:', currentTime);

    // Fetch attendance data using service
    const cacheKey = `attendance:${user.employeeId}`;

    const fetchAttendanceData = async () => {
      // Get attendance status (which includes overtime attendances)
      const [attendanceStatus, shiftData, leaveRequests] = await Promise.all([
        attendanceService.getLatestAttendanceStatus(preparedUser.employeeId),
        services.shiftService.getEffectiveShiftAndStatus(
          preparedUser.employeeId,
          currentTime,
        ),
        services.leaveService.getLeaveRequests(preparedUser.employeeId),
      ]);

      console.log('Attendance Status:', attendanceStatus);
      console.log('Shift Data:', shiftData);
      console.log('Leave Requests:', leaveRequests);

      // Get check-in/out allowance
      const checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
        preparedUser.employeeId,
        inPremises === 'true',
        address as string,
      );

      // Transform overtime attendances to ensure proper structure
      const transformedAttendances =
        attendanceStatus?.overtimeAttendances?.map((ot) => ({
          overtimeRequest: {
            id: ot.overtimeRequest.id,
            employeeId: ot.overtimeRequest.employeeId,
            date: ot.overtimeRequest.date,
            startTime: ot.overtimeRequest.startTime,
            endTime: ot.overtimeRequest.endTime,
            durationMinutes: ot.overtimeRequest.durationMinutes,
            status: ot.overtimeRequest.status,
            reason: ot.overtimeRequest.reason,
            isDayOffOvertime: ot.overtimeRequest.isDayOffOvertime,
            isInsideShiftHours: ot.overtimeRequest.isInsideShiftHours,
            employeeResponse: ot.overtimeRequest.employeeResponse,
            approverId: ot.overtimeRequest.approverId,
          },
          attendanceTime: ot.attendanceTime
            ? {
                checkInTime: ot.attendanceTime.checkInTime,
                checkOutTime: ot.attendanceTime.checkOutTime,
                checkStatus: ot.attendanceTime.checkStatus,
                isOvertime: ot.attendanceTime.isOvertime ?? false,
                overtimeState: ot.attendanceTime.overtimeState,
              }
            : null,
          periodStatus: {
            isPending: ot.periodStatus.isPending,
            isActive: ot.periodStatus.isActive,
            isNext: ot.periodStatus.isNext,
            isComplete: ot.periodStatus.isComplete,
          },
        })) || [];

      // Transform attendance status to ensure proper structure
      const transformedAttendanceStatus = attendanceStatus
        ? {
            ...attendanceStatus,
            user: {
              ...attendanceStatus.user,
              nickname: attendanceStatus.user?.nickname ?? null,
            },
            overtimeAttendances: transformedAttendances,
            latestAttendance: attendanceStatus.latestAttendance
              ? {
                  id: attendanceStatus.latestAttendance.id,
                  employeeId: attendanceStatus.latestAttendance.employeeId,
                  date: attendanceStatus.latestAttendance.date,
                  regularCheckInTime:
                    attendanceStatus.latestAttendance.regularCheckInTime,
                  regularCheckOutTime:
                    attendanceStatus.latestAttendance.regularCheckOutTime,
                  state: attendanceStatus.latestAttendance.state,
                  checkStatus:
                    attendanceStatus.latestAttendance.checkStatus ??
                    CheckStatus.PENDING,
                  overtimeState:
                    attendanceStatus.latestAttendance.overtimeState,
                  isManualEntry:
                    attendanceStatus.latestAttendance.isManualEntry ?? false,
                  isDayOff: attendanceStatus.latestAttendance.isDayOff ?? false,
                  shiftStartTime:
                    attendanceStatus.latestAttendance.shiftStartTime,
                  shiftEndTime: attendanceStatus.latestAttendance.shiftEndTime,
                }
              : null,
            currentPeriod: {
              ...attendanceStatus.currentPeriod,
              checkInTime: attendanceStatus.currentPeriod?.checkInTime ?? null,
              checkOutTime:
                attendanceStatus.currentPeriod?.checkOutTime ?? null,
            },
            isOvertime: Boolean(attendanceStatus.isOvertime),
            overtimeDuration: attendanceStatus.overtimeDuration ?? 0,
          }
        : null;

      return {
        user: {
          ...preparedUser,
          nickname: preparedUser.nickname ?? null,
        },
        attendanceStatus: transformedAttendanceStatus,
        effectiveShift: shiftData?.effectiveShift ?? null,
        checkInOutAllowance: checkInOutAllowance
          ? {
              ...checkInOutAllowance,
              periodType:
                transformedAttendanceStatus?.currentPeriod?.type ||
                PeriodType.REGULAR,
              overtimeId:
                transformedAttendanceStatus?.currentPeriod?.type ===
                PeriodType.OVERTIME
                  ? transformedAttendanceStatus.currentPeriod.overtimeId
                  : undefined,
            }
          : null,
        approvedOvertime: transformedAttendanceStatus?.approvedOvertime ?? null,
        leaveRequests: leaveRequests ?? [],
      };
    };

    // Handle caching and validation
    let responseData;
    if (cacheService && !forceRefresh) {
      const cachedResponse = await cacheService.getWithSWR(
        cacheKey,
        fetchAttendanceData,
        300,
      );

      // Validate cached data
      const cachedValidation = ResponseDataSchema.safeParse(cachedResponse);
      if (cachedValidation.success) {
        responseData = cachedValidation.data;
      } else {
        // If cached data is invalid, fetch fresh data
        console.warn(
          'Invalid cached data, fetching fresh data:',
          JSON.stringify(cachedValidation.error.errors, null, 2),
        );
        responseData = await fetchAttendanceData();
      }
    } else {
      responseData = await fetchAttendanceData();
    }

    const validationResult = ResponseDataSchema.safeParse(responseData);

    if (!validationResult.success) {
      console.error('Validation Errors:', validationResult.error.errors);
      console.error('Response Data:', JSON.stringify(responseData, null, 2));

      // Return a fallback response instead of throwing an error
      const fallbackData = await createFallbackResponse(preparedUser);
      const fallbackValidation = ResponseDataSchema.safeParse(fallbackData);

      if (fallbackValidation.success) {
        return res.status(200).json(fallbackValidation.data);
      }

      return res.status(404).json({
        error: 'Validation failed for attendance status',
        validationErrors: validationResult.error.errors,
      });
    }

    return res.status(200).json(validationResult.data);
  } catch (error) {
    console.error('Error in attendance-status:', error);

    if (error instanceof AppError) {
      return res
        .status(error.code === ErrorCode.USER_NOT_FOUND ? 404 : 400)
        .json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
    }

    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message:
        error instanceof Error ? error.message : 'An unexpected error occurred',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      }),
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Fallback response helper
async function createFallbackResponse(user: any) {
  return {
    user,
    attendanceStatus: {
      latestAttendance: null,
      state: 'absent',
      checkStatus: 'pending',
      overtimeState: null,
      isOvertime: false,
      overtimeDuration: 0,
      overtimeEntries: [],
      isCheckingIn: false,
      isDayOff: false,
      isHoliday: false,
      dayOffType: 'none',
      currentPeriod: {
        type: 'regular',
        isComplete: false,
        checkInTime: null,
        checkOutTime: null,
        current: null,
      },
    },
    effectiveShift: {
      id: 'default',
      name: 'Default Shift',
      shiftCode: 'DEFAULT',
      startTime: '08:00',
      endTime: '17:00',
      workDays: [1, 2, 3, 4, 5],
    },
    checkInOutAllowance: {
      allowed: false,
      reason: 'No attendance data available.',
    },
    approvedOvertime: null,
    leaveRequests: [],
  };
}

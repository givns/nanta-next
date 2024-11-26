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
  AttendanceState,
} from '../../types/attendance';
import { initializeServices } from '../../services/ServiceInitializer';
import { get } from 'lodash';
import { getCurrentTime } from '@/utils/dateUtils';
import { endOfDay, startOfDay } from 'date-fns';
import type { ZodIssue } from 'zod'; // Add this import at the top

// Update the logging helper
const logValidationErrors = (
  errors: ZodIssue[],
  data: any,
  context: string = 'Validation Error',
) => {
  console.error(`=== ${context} Details ===`);
  errors.forEach((error, index) => {
    console.error(`Error ${index + 1}:`);
    console.error(`- Path: ${error.path.join('.')}`);
    console.error(`- Code: ${error.code}`);
    console.error(`- Message: ${error.message}`);
    console.error('- Actual Value:', get(data, error.path));
    if ('expected' in error) {
      console.error('Expected Type:', error.expected);
    }
    console.error('---');
  });
  console.error('=== Full Data Structure ===');
  try {
    console.error(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(
      'Data contains circular references or non-serializable values',
    );
    console.error(data);
  }
  console.error('=========================');
};

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

// Create fallback response
function createFallbackResponse(user: any) {
  const now = getCurrentTime();
  return {
    user,
    attendanceStatus: {
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      overtimeState: null,
      isOvertime: false,
      overtimeDuration: 0,
      overtimeEntries: [],
      detailedStatus: 'absent',
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      user: user,
      latestAttendance: null,
      isCheckingIn: true,
      isDayOff: false,
      isHoliday: false,
      holidayInfo: null,
      dayOffType: 'none',
      isOutsideShift: false,
      isLate: false,
      shiftAdjustment: null,
      approvedOvertime: null,
      futureShifts: [],
      futureOvertimes: [],
      overtimeAttendances: [],
      currentPeriod: {
        type: PeriodType.REGULAR,
        isComplete: false,
        current: {
          start: startOfDay(now),
          end: endOfDay(now),
        },
      },
      pendingLeaveRequest: false,
    },
    effectiveShift: null,
    checkInOutAllowance: {
      allowed: false,
      reason: 'System error occurred',
      inPremises: false,
      address: '',
      periodType: PeriodType.REGULAR,
      flags: {
        isOvertime: false,
      },
      timing: {},
      metadata: {},
      isLastPeriod: false,
    },
    approvedOvertime: null,
    leaveRequests: [],
  };
}

// Main API Handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Store user for fallback scenarios
  let user: any = null;
  let preparedUser: any = null;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

  const { employeeId, lineUserId, inPremises, address, forceRefresh } =
    req.query;

  try {
    // User Data Fetching
    user = await (async () => {
      if (lineUserId && typeof lineUserId === 'string') {
        const cacheKey = `user:${lineUserId}`;
        const cachedUser = cacheService
          ? await cacheService.get(cacheKey)
          : null;

        if (cachedUser) {
          console.log('User data found in cache for key:', cacheKey);
          return JSON.parse(cachedUser);
        }

        const user = await prisma.user.findUnique({
          where: { lineUserId },
          include: { department: true },
        });

        if (user && cacheService) {
          await cacheService.set(cacheKey, JSON.stringify(user), 3600);
          console.log('Caching user data for key:', cacheKey);
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

    preparedUser = prepareUserData(user);
    const currentTime = getCurrentTime();
    console.log('Current time in attendance-status:', currentTime);

    // Fetch attendance data using service
    const cacheKey = `attendance:${user.employeeId}`;

    const fetchAttendanceData = async () => {
      try {
        console.log('Fetching attendance data for:', user.employeeId);

        // Use Promise.allSettled instead of Promise.all
        const [attendanceStatusResult, shiftDataResult, leaveRequestsResult] =
          await Promise.allSettled([
            attendanceService.getLatestAttendanceStatus(
              preparedUser.employeeId,
            ),
            services.shiftService.getEffectiveShiftAndStatus(
              preparedUser.employeeId,
              currentTime,
            ),
            services.leaveService.getLeaveRequests(preparedUser.employeeId),
          ]);

        // Log results of each promise
        console.log('Promise results:', {
          attendanceStatus: attendanceStatusResult.status,
          shiftData: shiftDataResult.status,
          leaveRequests: leaveRequestsResult.status,
        });

        // Safely extract values with fallbacks
        const attendanceStatus =
          attendanceStatusResult.status === 'fulfilled'
            ? attendanceStatusResult.value
            : null;
        const shiftData =
          shiftDataResult.status === 'fulfilled' ? shiftDataResult.value : null;
        const leaveRequests =
          leaveRequestsResult.status === 'fulfilled'
            ? leaveRequestsResult.value
            : [];

        // Log extracted data
        if (attendanceStatus)
          console.log(
            'Attendance Status:',
            JSON.stringify(attendanceStatus, null, 2),
          );
        if (shiftData)
          console.log('Shift Data:', JSON.stringify(shiftData, null, 2));
        console.log('Leave Requests count:', leaveRequests.length);

        // Get check-in/out allowance with error handling
        let checkInOutAllowance;
        try {
          checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
            preparedUser.employeeId,
            inPremises === 'true',
            address as string,
          );
        } catch (error) {
          console.error('Error getting check-in/out allowance:', error);
          checkInOutAllowance = null;
        }

        // Transform attendance status to ensure proper structure
        const transformedAttendanceStatus = attendanceStatus
          ? {
              ...attendanceStatus,
              user: {
                ...attendanceStatus.user,
                nickname: attendanceStatus.user?.nickname ?? null,
              },
              currentPeriod: {
                ...attendanceStatus.currentPeriod,
                checkInTime:
                  attendanceStatus.currentPeriod?.checkInTime ?? null,
                checkOutTime:
                  attendanceStatus.currentPeriod?.checkOutTime ?? null,
                current: attendanceStatus.currentPeriod?.current ?? {
                  start: startOfDay(currentTime),
                  end: endOfDay(currentTime),
                },
              },
              isOvertime: Boolean(attendanceStatus.isOvertime),
              overtimeDuration: attendanceStatus.overtimeDuration ?? 0,
            }
          : null;

        // Construct the response data
        const responseData = {
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
                flags: checkInOutAllowance.flags ?? {},
                timing: checkInOutAllowance.timing ?? {},
                metadata: checkInOutAllowance.metadata ?? {},
                isLastPeriod: checkInOutAllowance.isLastPeriod ?? false,
              }
            : null,
          approvedOvertime:
            transformedAttendanceStatus?.approvedOvertime ?? null,
          leaveRequests: leaveRequests ?? [],
        };

        return responseData;
      } catch (error) {
        console.error('Error in fetchAttendanceData:', error);
        return createFallbackResponse(preparedUser);
      }
    };

    // Handle caching and validation
    let responseData;
    if (cacheService && !forceRefresh) {
      try {
        const cachedResponse = await cacheService.getWithSWR(
          cacheKey,
          fetchAttendanceData,
          300,
        );

        // Validate cached data
        const cachedValidation = ResponseDataSchema.safeParse(cachedResponse);
        if (cachedValidation.success) {
          responseData = cachedValidation.data;
          console.log('Using valid cached data');
        } else {
          console.warn('Invalid cached data, fetching fresh data');
          logValidationErrors(
            cachedValidation.error.errors,
            cachedResponse,
            'Cache Validation Error',
          );
          responseData = await fetchAttendanceData();
        }
      } catch (error) {
        console.error('Cache error:', error);
        responseData = await fetchAttendanceData();
      }
    } else {
      responseData = await fetchAttendanceData();
    }

    // Final validation
    const validationResult = ResponseDataSchema.safeParse(responseData);

    if (!validationResult.success) {
      console.error('Final validation failed');
      logValidationErrors(
        validationResult.error.errors,
        responseData,
        'Final Validation Error',
      );

      // Try fallback
      const fallbackData = await createFallbackResponse(preparedUser);
      const fallbackValidation = ResponseDataSchema.safeParse(fallbackData);

      if (fallbackValidation.success) {
        console.log('Using fallback data');
        return res.status(200).json(fallbackValidation.data);
      }

      console.error('Fallback validation failed');
      logValidationErrors(
        fallbackValidation.error.errors,
        fallbackData,
        'Fallback Validation Error',
      );

      // Return minimal valid structure
      return res.status(200).json({
        user: preparedUser,
        attendanceStatus: {
          state: AttendanceState.ABSENT,
          checkStatus: CheckStatus.PENDING,
          isCheckingIn: true,
          currentPeriod: {
            type: PeriodType.REGULAR,
            isComplete: false,
            current: {
              start: startOfDay(currentTime),
              end: endOfDay(currentTime),
            },
          },
        },
        effectiveShift: null,
        checkInOutAllowance: {
          allowed: false,
          reason: 'System temporarily unavailable',
          inPremises: false,
          address: '',
          periodType: PeriodType.REGULAR,
          flags: {},
          timing: {},
          metadata: {},
          isLastPeriod: false,
        },
        approvedOvertime: null,
        leaveRequests: [],
      });
    }

    return res.status(200).json(validationResult.data);
  } catch (error) {
    console.error('Critical error in handler:', error);

    if (error instanceof AppError) {
      return res
        .status(error.code === ErrorCode.USER_NOT_FOUND ? 404 : 400)
        .json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
    }

    // Create a minimal user for fallback if preparedUser is not available
    const fallbackUser =
      preparedUser ||
      (user
        ? prepareUserData(user)
        : {
            employeeId: (employeeId as string) || 'unknown',
            name: 'Unknown User',
            lineUserId: (lineUserId as string) || null,
            nickname: null,
            departmentName: 'Unknown Department',
            role: 'Employee',
            profilePictureUrl: null,
            shiftId: null,
            shiftCode: null,
            sickLeaveBalance: 0,
            businessLeaveBalance: 0,
            annualLeaveBalance: 0,
          });

    const fallbackData = createFallbackResponse(fallbackUser);
    return res.status(200).json(fallbackData);
  } finally {
    await prisma.$disconnect();
  }
}

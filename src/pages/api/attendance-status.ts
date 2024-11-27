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
import { endOfDay, startOfDay, format } from 'date-fns';
import type { ZodIssue } from 'zod';

// Constants
const DEBOUNCE_TIME = 1000; // 1 second
const LOCK_TIMEOUT = 5; // 5 seconds
const CACHE_TTL = 300; // 5 minutes
let lastFetchTime = 0;

// Validation logging helpers
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
    const actualValue = get(data, error.path);
    console.error(
      '- Actual Value:',
      typeof actualValue === 'object'
        ? JSON.stringify(actualValue)
        : actualValue,
    );
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
      isOutsideShift: true,
      isLate: false,
      shiftAdjustment: {
        date: format(now, 'yyyy-MM-dd'),
        requestedShiftId: user.shiftId || 'default',
        requestedShift: {
          id: user.shiftId || 'default',
          name: 'Default Shift',
          startTime: '08:00',
          endTime: '17:00',
          workDays: [1, 2, 3, 4, 5],
          shiftCode: user.shiftCode || 'DEFAULT',
        },
      },
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

    // Fetch attendance data using service with debounce
    const fetchAttendanceDataWithDebounce = async () => {
      const now = Date.now();
      if (now - lastFetchTime < DEBOUNCE_TIME) {
        console.log('Request debounced, using cached data');
        return null;
      }
      lastFetchTime = now;

      console.log('Fetching fresh attendance data');
      return fetchAttendanceData();
    };

    // Modify fetchAttendanceData function in attendance-status.ts
    const fetchAttendanceData = async () => {
      try {
        console.log('Fetching attendance data for:', user.employeeId);

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

        console.log('Promise results:', {
          attendanceStatus: attendanceStatusResult.status,
          shiftData: shiftDataResult.status,
          leaveRequests: leaveRequestsResult.status,
        });

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

        // Format the main attendance status
        const formattedAttendanceStatus = {
          state: attendanceStatus?.state || AttendanceState.ABSENT,
          checkStatus: attendanceStatus?.checkStatus || CheckStatus.PENDING,
          overtimeState: attendanceStatus?.overtimeState,
          isOvertime: attendanceStatus?.isOvertime || false,
          isLate: attendanceStatus?.isLate || false,
          overtimeDuration: attendanceStatus?.overtimeDuration || 0,
          overtimeEntries: attendanceStatus?.overtimeEntries || [],
          isCheckingIn: attendanceStatus?.isCheckingIn ?? true,
          isEarlyCheckIn: attendanceStatus?.isEarlyCheckIn || false,
          isLateCheckIn: attendanceStatus?.isLateCheckIn || false,
          isLateCheckOut: attendanceStatus?.isLateCheckOut || false,
          user: preparedUser,
          latestAttendance: attendanceStatus?.latestAttendance || null,
          isDayOff: attendanceStatus?.isDayOff || false,
          isHoliday: attendanceStatus?.isHoliday || false,
          holidayInfo: attendanceStatus?.holidayInfo || null,
          dayOffType: attendanceStatus?.dayOffType || 'none',
          isOutsideShift: attendanceStatus?.isOutsideShift || false,
          shiftAdjustment: attendanceStatus?.shiftAdjustment || {
            date: format(currentTime, 'yyyy-MM-dd'),
            requestedShiftId: shiftData?.effectiveShift?.id || 'default',
            requestedShift: shiftData?.effectiveShift || {
              id: 'default',
              name: 'Default Shift',
              shiftCode: user.shiftCode || 'DEFAULT',
              startTime: '08:00',
              endTime: '17:00',
              workDays: [1, 2, 3, 4, 5],
            },
          },
          approvedOvertime: attendanceStatus?.approvedOvertime || null,
          futureShifts: attendanceStatus?.futureShifts || [],
          futureOvertimes: attendanceStatus?.futureOvertimes || [],
          overtimeAttendances: attendanceStatus?.overtimeAttendances || [],
          currentPeriod: attendanceStatus?.currentPeriod || {
            type: PeriodType.REGULAR,
            isComplete: false,
            current: {
              start: startOfDay(currentTime).toISOString(),
              end: endOfDay(currentTime).toISOString(),
            },
          },
          detailedStatus: attendanceStatus?.detailedStatus || 'pending',
          pendingLeaveRequest: attendanceStatus?.pendingLeaveRequest || false,
        };

        // Return without double nesting of attendanceStatus
        return {
          user: preparedUser,
          attendanceStatus: {
            user: preparedUser,
            attendanceStatus: {  // Add nested attendanceStatus object to match schema
              state: formattedAttendanceStatus.state,
              checkStatus: formattedAttendanceStatus.checkStatus,
              overtimeState: formattedAttendanceStatus.overtimeState,
              isOvertime: formattedAttendanceStatus.isOvertime,
              isLate: formattedAttendanceStatus.isLate,
              overtimeDuration: formattedAttendanceStatus.overtimeDuration,
              overtimeEntries: formattedAttendanceStatus.overtimeEntries,
              isCheckingIn: formattedAttendanceStatus.isCheckingIn,
              isEarlyCheckIn: formattedAttendanceStatus.isEarlyCheckIn,
              isLateCheckIn: formattedAttendanceStatus.isLateCheckIn,
              isLateCheckOut: formattedAttendanceStatus.isLateCheckOut,
              user: formattedAttendanceStatus.user,
              latestAttendance: formattedAttendanceStatus.latestAttendance,
              isDayOff: formattedAttendanceStatus.isDayOff,
              isHoliday: formattedAttendanceStatus.isHoliday,
              holidayInfo: formattedAttendanceStatus.holidayInfo,
              dayOffType: formattedAttendanceStatus.dayOffType,
              isOutsideShift: formattedAttendanceStatus.isOutsideShift,
              shiftAdjustment: formattedAttendanceStatus.shiftAdjustment,
              approvedOvertime: formattedAttendanceStatus.approvedOvertime,
              futureShifts: formattedAttendanceStatus.futureShifts,
              futureOvertimes: formattedAttendanceStatus.futureOvertimes,
              overtimeAttendances: formattedAttendanceStatus.overtimeAttendances,
              currentPeriod: {
                ...formattedAttendanceStatus.currentPeriod,
                current: {
                  start: new Date(formattedAttendanceStatus.currentPeriod.current.start).toISOString(),
                  end: new Date(formattedAttendanceStatus.currentPeriod.current.end).toISOString()
                }
              },
              detailedStatus: formattedAttendanceStatus.detailedStatus,
              pendingLeaveRequest: formattedAttendanceStatus.pendingLeaveRequest
            }
          },
          effectiveShift: shiftData?.effectiveShift || null,
          checkInOutAllowance: checkInOutAllowance
            ? {
                ...checkInOutAllowance,
                periodType: formattedAttendanceStatus.currentPeriod.type,
                flags: checkInOutAllowance.flags || {},
                timing: checkInOutAllowance.timing || {},
                metadata: checkInOutAllowance.metadata || {},
                isLastPeriod: checkInOutAllowance.isLastPeriod || false,
              }
            : null,
          approvedOvertime: formattedAttendanceStatus.approvedOvertime,
          leaveRequests: leaveRequests || []
        };
      } catch (error) {
        console.error('Error in fetchAttendanceData:', error);
        return createFallbackResponse(preparedUser);
      }
    };

    // Handle caching with lock mechanism
    const cacheKey = `attendance:${user.employeeId}`;
    let responseData;

    if (cacheService && !forceRefresh) {
      try {
        const lockKey = `lock:${cacheKey}`;
        const isLocked = await cacheService.get(lockKey);

        if (isLocked) {
          console.log('Cache operation in progress, waiting...');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await cacheService.set(lockKey, 'true', LOCK_TIMEOUT);

        try {
          const cachedResponse = await cacheService.getWithSWR(
            cacheKey,
            fetchAttendanceDataWithDebounce,
            CACHE_TTL,
          );

          if (!cachedResponse) {
            console.log('No cached data available, fetching fresh');
            responseData = await fetchAttendanceData();
          } else {
            const cachedValidation =
              ResponseDataSchema.safeParse(cachedResponse);
            if (cachedValidation.success) {
              console.log('Using valid cached data');
              responseData = cachedValidation.data;
            } else {
              console.warn('Invalid cached data, fetching fresh');
              logValidationErrors(
                cachedValidation.error.issues,
                cachedResponse,
                'Cache Validation Error',
              );
              responseData = await fetchAttendanceData();
            }
          }
        } finally {
          await cacheService.del(lockKey);
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
        validationResult.error.issues,
        responseData,
        'Final Validation Error',
      );

      // Return fallback data
      const fallbackData = createFallbackResponse(preparedUser);
      return res.status(200).json(fallbackData);
    }

    return res.status(200).json(validationResult.data);
  } catch (error) {
    console.error('Critical error in handler:', error);

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

import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AttendanceService } from '../../services/Attendance/AttendanceService';
import { cacheService } from '../../services/CacheService';
import { ResponseDataSchema } from '../../schemas/attendance';
import {
  AppError,
  ErrorCode,
  CheckStatus,
  PeriodType,
  AttendanceState,
  CheckInOutAllowance,
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
const REQUEST_TIMEOUT = 5000; // 5 seconds
const MAX_RETRIES = 2;

// Request validation schema
const RequestSchema = z.object({
  employeeId: z.string().optional(),
  lineUserId: z.string().optional(),
  inPremises: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
  address: z.string().optional(),
  forceRefresh: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

// Types
type RequestParams = z.infer<typeof RequestSchema>;
type ResponseData = z.infer<typeof ResponseDataSchema>;

// Request tracking for deduplication
const requestTracker = new Map<
  string,
  {
    promise: Promise<ResponseData>;
    timestamp: number;
  }
>();

// Helper function to create a request key
const createRequestKey = (params: RequestParams): string => {
  return `${params.employeeId || params.lineUserId}:${getCurrentTime().getTime()}`;
};

// Helper function to clean up old request trackers
const cleanupRequestTracker = () => {
  const now = Date.now();
  for (const [key, value] of requestTracker.entries()) {
    if (now - value.timestamp > REQUEST_TIMEOUT) {
      requestTracker.delete(key);
    }
  }
};

// Helper function for timeout
const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    throw error;
  }
};

// Validation logging helper
const logValidationErrors = (
  errors: ZodIssue[],
  data: any,
  context: string = 'Validation Error',
) => {
  console.error(`=== ${context} Details ===`);
  errors.forEach((error) => {
    console.error(`- Path: ${error.path.join('.')}`);
    console.error(`- Message: ${error.message}`);
    const actualValue = get(data, error.path);
    console.error(
      '- Actual Value:',
      typeof actualValue === 'object'
        ? JSON.stringify(actualValue)
        : actualValue,
    );
  });
};

const ensureValidResponse = (data: any) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
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

// Create fallback user
const createFallbackUser = (
  employeeId: string | string[] | undefined,
  lineUserId: string | string[] | undefined,
) => ({
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

// Create fallback response
const createFallbackResponse = (user: any): ResponseData => {
  const now = getCurrentTime();
  return {
    user,
    attendanceStatus: {
      user,
      attendanceStatus: {
        state: AttendanceState.ABSENT,
        checkStatus: CheckStatus.PENDING,
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
            id: 'default',
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
    },
    effectiveShift: null,
    checkInOutAllowance: null,
    approvedOvertime: null,
    leaveRequests: [],
  };
};

// Fetch attendance data function
const fetchAttendanceData = async (
  preparedUser: any,
  inPremises: boolean,
  address: string | string[] | undefined,
): Promise<ResponseData> => {
  try {
    console.log('Fetching attendance data for:', preparedUser.employeeId);
    const currentTime = getCurrentTime();

    const [attendanceStatusResult, shiftDataResult, leaveRequestsResult] =
      await Promise.allSettled([
        withTimeout(
          attendanceService.getLatestAttendanceStatus(preparedUser.employeeId),
          REQUEST_TIMEOUT,
          'Attendance status fetch timeout',
        ),
        withTimeout(
          services.shiftService.getEffectiveShiftAndStatus(
            preparedUser.employeeId,
            currentTime,
          ),
          REQUEST_TIMEOUT,
          'Shift data fetch timeout',
        ),
        withTimeout(
          services.leaveService.getLeaveRequests(preparedUser.employeeId),
          REQUEST_TIMEOUT,
          'Leave requests fetch timeout',
        ),
      ]);

    const attendanceStatus =
      attendanceStatusResult.status === 'fulfilled'
        ? ensureValidResponse(attendanceStatusResult.value)
        : null;
    const shiftData =
      shiftDataResult.status === 'fulfilled'
        ? ensureValidResponse(shiftDataResult.value)
        : null;
    const leaveRequests =
      leaveRequestsResult.status === 'fulfilled'
        ? ensureValidResponse(leaveRequestsResult.value)
        : [];

    // Create initial response data
    const responseData: ResponseData = {
      user: preparedUser,
      attendanceStatus: {
        user: preparedUser,
        attendanceStatus: {
          state: attendanceStatus?.state || AttendanceState.ABSENT,
          checkStatus: attendanceStatus?.checkStatus || CheckStatus.PENDING,
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
              shiftCode: preparedUser.shiftCode || 'DEFAULT',
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
              start: startOfDay(currentTime),
              end: endOfDay(currentTime),
            },
          },
          detailedStatus: attendanceStatus?.detailedStatus || 'pending',
          pendingLeaveRequest: attendanceStatus?.pendingLeaveRequest || false,
        },
      },
      effectiveShift: shiftData?.effectiveShift || null,
      checkInOutAllowance: null,
      approvedOvertime: attendanceStatus?.approvedOvertime || null,
      leaveRequests: leaveRequests || [],
    };

    // Handle check-in/out allowance separately
    try {
      const checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
        preparedUser.employeeId,
        inPremises, // Should be passed as is since the service expects string | string[] | undefined
        address as string,
      );

      if (checkInOutAllowance) {
        responseData.checkInOutAllowance = {
          ...checkInOutAllowance,
          periodType:
            responseData.attendanceStatus.attendanceStatus.currentPeriod
              ?.type || PeriodType.REGULAR,
        } as CheckInOutAllowance;
      }
    } catch (error) {
      console.error('Error getting check-in/out allowance:', error);
    }

    return responseData;
  } catch (error) {
    console.error('Error in fetchAttendanceData:', error);
    return createFallbackResponse(preparedUser);
  }
};

// Main API handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate');

  let user: any = null;
  let preparedUser: any = null;
  let responseData: ResponseData | null = null;
  const validatedParams = RequestSchema.parse(req.query);
  const { employeeId, lineUserId, inPremises, address, forceRefresh } =
    validatedParams;

  console.debug('Attendance API request params:', {
    employeeId,
    lineUserId,
    inPremises,
    address,
  });

  // Validate required parameters
  if (!employeeId && !lineUserId) {
    return res.status(400).json({
      error: 'Missing required parameters',
      message: 'Either employeeId or lineUserId is required',
    });
  }

  // User Data Fetching
  const fetchUserData = async () => {
    if (lineUserId) {
      const cacheKey = `user:${lineUserId}`;
      const cachedUser = cacheService ? await cacheService.get(cacheKey) : null;

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

    if (employeeId) {
      return prisma.user.findUnique({
        where: { employeeId },
        include: { department: true },
      });
    }

    return null;
  };

  try {
    // Validate request parameters

    // Clean up old request trackers
    cleanupRequestTracker();

    // Check for existing request
    const requestKey = createRequestKey(validatedParams);
    const existingRequest = requestTracker.get(requestKey);
    if (
      existingRequest &&
      Date.now() - existingRequest.timestamp < REQUEST_TIMEOUT
    ) {
      return res.json(await existingRequest.promise);
    }

    // Fetch user data
    user = await fetchUserData();

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'Please complete your registration first.',
      });
    }

    preparedUser = prepareUserData(user);
    const cacheKey = `attendance:${validatedParams.employeeId || validatedParams.lineUserId}`; // Use validatedParams

    // Create request promise
    const fetchPromise = (async () => {
      if (cacheService && !forceRefresh) {
        const lockKey = `lock:${cacheKey}`;
        const isLocked = await cacheService.get(lockKey);

        if (isLocked) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        try {
          await cacheService.set(lockKey, 'true', LOCK_TIMEOUT);
          const cachedResponse = await cacheService.get(cacheKey);

          if (cachedResponse) {
            const parsedResponse = ensureValidResponse(cachedResponse);
            const validation = ResponseDataSchema.safeParse(parsedResponse);
            if (validation.success) {
              return validation.data;
            }
          }

          responseData = await fetchAttendanceData(
            preparedUser,
            inPremises,
            address,
          );
          if (responseData) {
            await cacheService.set(
              cacheKey,
              JSON.stringify(responseData),
              CACHE_TTL,
            );
          }
          return responseData;
        } finally {
          await cacheService.del(lockKey);
        }
      }

      return await fetchAttendanceData(preparedUser, inPremises, address);
    })();

    // Track the request
    requestTracker.set(requestKey, {
      promise: fetchPromise,
      timestamp: Date.now(),
    });

    try {
      // Wait for result and send response
      responseData = await fetchPromise;

      if (!responseData) {
        throw new Error('No response data available');
      }

      // Final validation before sending response
      const finalValidation = ResponseDataSchema.safeParse(responseData);
      if (!finalValidation.success) {
        console.warn(
          'Final response validation failed:',
          finalValidation.error,
        );
        return res.status(200).json(createFallbackResponse(preparedUser));
      }

      return res.status(200).json(finalValidation.data);
    } catch (error) {
      console.error('Error processing request:', error);
      return res.status(200).json(createFallbackResponse(preparedUser));
    }
  } catch (error) {
    console.error('Attendance API Error:', {
      path: req.url,
      query: req.query,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });

    // Return error with guidance
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch attendance status. Please try again.',
      timestamp: new Date().toISOString(),
    });
  } finally {
    await prisma.$disconnect();
  }
}

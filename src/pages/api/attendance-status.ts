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
import { getCurrentTime } from '@/utils/dateUtils';
import { endOfDay, startOfDay, format } from 'date-fns';

// Constants
const LOCK_TIMEOUT = 5; // 5 seconds
const CACHE_TTL = 300; // 5 minutes
const REQUEST_TIMEOUT = 5000; // 5 seconds

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

type RequestParams = z.infer<typeof RequestSchema>;
type ResponseData = z.infer<typeof ResponseDataSchema>;

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

// Helper function to prepare user data with proper defaults
const prepareUserData = (user: any) => ({
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
  shiftId: user.shiftId,
  shiftCode: user.shiftCode,
  profilePictureUrl: user.profilePictureUrl,
  updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
});

// Main data fetching function
const fetchAttendanceData = async (
  preparedUser: any,
  inPremises: boolean,
  address: string | string[] | undefined,
): Promise<ResponseData> => {
  console.log('Fetching attendance data for:', preparedUser.employeeId);
  const currentTime = getCurrentTime();

  // Fetch all required data
  const [attendanceStatus, shiftData, leaveRequests] = await Promise.all([
    attendanceService.getLatestAttendanceStatus(preparedUser.employeeId),
    services.shiftService.getEffectiveShiftAndStatus(
      preparedUser.employeeId,
      currentTime,
    ),
    services.leaveService.getLeaveRequests(preparedUser.employeeId),
  ]);

  // Verify we have the minimum required data
  if (!shiftData?.effectiveShift) {
    throw new AppError({
      code: ErrorCode.SHIFT_DATA_ERROR,
      message: 'Shift configuration not found',
    });
  }

  // Determine check-in status based on current period data
  const hasCheckedIn = Boolean(
    attendanceStatus?.latestAttendance?.regularCheckInTime,
  );
  const hasCheckedOut = Boolean(
    attendanceStatus?.latestAttendance?.regularCheckOutTime,
  );
  const isCheckingIn = !hasCheckedIn || hasCheckedOut;

  const mappedApprovedOvertime = attendanceStatus?.approvedOvertime
    ? {
        ...attendanceStatus.approvedOvertime,
        status: 'approved' as const, // Explicitly set status
        updatedAt: new Date(), // Add missing fields
        createdAt: new Date(),
        employeeId: preparedUser.employeeId,
      }
    : null;

  const mappedFutureOvertimes = (attendanceStatus?.futureOvertimes || []).map(
    (overtime) => ({
      ...overtime,
      status: 'approved' as const,
      employeeId: preparedUser.employeeId,
      updatedAt: new Date(),
      createdAt: new Date(),
    }),
  );

  const mappedLeaveRequests = (leaveRequests || []).map((leave) => ({
    employeeId: leave.employeeId,
    status: leave.status as 'approved' | 'pending' | 'rejected',
    id: leave.id,
    reason: leave.reason,
    leaveType: leave.leaveType,
    leaveFormat: leave.leaveFormat,
    startDate: leave.startDate,
    endDate: leave.endDate,
    fullDayCount: leave.fullDayCount,
  }));

  // Build response data
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
        isCheckingIn,
        isEarlyCheckIn: attendanceStatus?.isEarlyCheckIn || false,
        isLateCheckIn: attendanceStatus?.isLateCheckIn || false,
        isLateCheckOut: attendanceStatus?.isLateCheckOut || false,
        user: preparedUser,
        latestAttendance: attendanceStatus?.latestAttendance || null,
        isDayOff: shiftData.shiftstatus.isDayOff || false,
        isHoliday: shiftData.shiftstatus.isHoliday || false,
        holidayInfo: attendanceStatus?.holidayInfo || null,
        dayOffType: attendanceStatus?.dayOffType || 'none',
        isOutsideShift: shiftData.shiftstatus.isOutsideShift || false,
        shiftAdjustment: {
          date: format(currentTime, 'yyyy-MM-dd'),
          requestedShiftId: shiftData.effectiveShift.id,
          requestedShift: shiftData.effectiveShift,
        },
        approvedOvertime: mappedApprovedOvertime,
        futureShifts: attendanceStatus?.futureShifts || [],
        futureOvertimes: mappedFutureOvertimes,
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
    effectiveShift: shiftData.effectiveShift,
    checkInOutAllowance: null, // Will be set below if available
    approvedOvertime: mappedApprovedOvertime,
    leaveRequests: mappedLeaveRequests,
  };

  // Get check-in/out allowance
  try {
    const checkInOutAllowance = await attendanceService.isCheckInOutAllowed(
      preparedUser.employeeId,
      inPremises,
      address as string,
    );

    if (checkInOutAllowance) {
      responseData.checkInOutAllowance = {
        ...checkInOutAllowance,
        periodType:
          responseData.attendanceStatus.attendanceStatus.currentPeriod?.type ||
          PeriodType.REGULAR,
      } as CheckInOutAllowance;
    }
  } catch (error) {
    console.error('Error getting check-in/out allowance:', error);
    // Don't throw here - allowance check is non-critical
  }

  return responseData;
};

// Main handler
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate request parameters
    const validatedParams = RequestSchema.parse(req.query);
    const { employeeId, lineUserId, inPremises, address } = validatedParams;

    if (!employeeId && !lineUserId) {
      return res.status(400).json({
        error: ErrorCode.INVALID_INPUT,
        message: 'Either employeeId or lineUserId is required',
      });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: employeeId ? { employeeId } : { lineUserId: lineUserId! },
      include: { department: true },
    });

    if (!user) {
      return res.status(404).json({
        error: ErrorCode.USER_NOT_FOUND,
        message: 'User not found. Please complete registration.',
      });
    }

    // Fetch and return attendance data
    const preparedUser = prepareUserData(user);
    const responseData = await fetchAttendanceData(
      preparedUser,
      inPremises || false,
      address,
    );

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Attendance API Error:', {
      error,
      query: req.query,
      timestamp: getCurrentTime().toISOString(),
    });

    if (error instanceof AppError) {
      return res.status(400).json({
        error: error.code,
        message: error.message,
      });
    }

    return res.status(500).json({
      error: ErrorCode.INTERNAL_ERROR,
      message: 'Service temporarily unavailable',
    });
  } finally {
    await prisma.$disconnect();
  }
}

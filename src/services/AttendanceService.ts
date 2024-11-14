//AttendanceService.ts
import {
  PrismaClient,
  Prisma,
  Attendance,
  User,
  LeaveRequest,
  TimeEntry as PrismaTimeEntry,
  OvertimeEntry as PrismaOvertimeEntry,
  Holiday,
  OvertimeRequest,
} from '@prisma/client';
import { ShiftManagementService } from './ShiftManagementService';
import { HolidayService } from './HolidayService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import {
  parseISO,
  format,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  isBefore,
  isAfter,
  isSameDay,
  addMinutes,
  addDays,
  max,
  min,
  subMinutes,
  set,
  subDays,
  isWithinInterval,
  addHours,
} from 'date-fns';
import {
  AttendanceData,
  AttendanceStatusInfo,
  AttendanceStatusInfoParams,
  ProcessedAttendance,
  ShiftData,
  ApprovedOvertime,
  AttendanceStatusValue,
  AttendanceStatusType,
  CheckInOutAllowance,
  OvertimeEntryData,
  LateCheckOutStatus,
  AttendanceRecord,
  HalfDayLeaveContext,
  OvertimeInfo,
  EnhancedAttendanceRecord,
  BaseAttendance,
  TimeEntryStatus,
  OvertimePeriod,
  OvertimeAttendanceInfo,
  TimeEntryInfo,
  OvertimeEntryInfo,
  OvertimeRequestStatus,
} from '../types/attendance';
import { UserData } from '../types/user';
import { NotificationService } from './NotificationService';
import { UserRole } from '../types/enum';
import { TimeEntryService } from './TimeEntryService';
import { getCurrentTime } from '../utils/dateUtils';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../lib/serverCache';
import { ErrorCode, AppError } from '../types/errors';
import { cacheService } from './CacheService';
import { CurrentPeriodInfo } from '../types/attendance'; // Import the CurrentPeriodInfo type

const USER_CACHE_TTL = 72 * 60 * 60; // 24 hours
const ATTENDANCE_CACHE_TTL = 30 * 60; // 30 minutes
const HOLIDAY_CACHE_TTL = 72 * 60 * 60; // 24 hours for holiday cache
const EARLY_CHECK_IN_THRESHOLD = 29; // 29 minutes before shift start
const LATE_CHECK_IN_THRESHOLD = 5; // 5 minutes after shift start
const LATE_CHECK_OUT_THRESHOLD = 15; // 15 minutes after shift end
const EARLY_CHECK_OUT_THRESHOLD = 15; // 15 minutes before shift end

interface FormattedTimeEntry {
  regularHours: number;
  overtimeHours: number;
  status: TimeEntryStatus; // Using the TimeEntryStatus type
  entryType: 'regular' | 'overtime';
}

export class AttendanceService {
  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
    private holidayService: HolidayService,
    private leaveService: LeaveServiceServer,
    private overtimeService: OvertimeServiceServer,
    private notificationService: NotificationService,
    private timeEntryService: TimeEntryService,
  ) {}

  async invalidateAttendanceCache(employeeId: string): Promise<void> {
    await invalidateCachePattern(`attendance:${employeeId}*`);
  }

  private async invalidateUserCache(employeeId: string) {
    if (cacheService) {
      const today = startOfDay(getCurrentTime());
      await Promise.all([
        cacheService.invalidatePattern(`user:${employeeId}*`),
        cacheService.invalidatePattern(`attendance:${employeeId}*`),
        cacheService.invalidatePattern(
          `holiday:${format(today, 'yyyy-MM-dd')}*`,
        ),
      ]);
    }
  }

  async updateUserData(employeeId: string, updateData: Partial<User>) {
    const updatedUser = await this.prisma.user.update({
      where: { employeeId },
      data: updateData,
    });

    // Invalidate cache asynchronously
    this.invalidateUserCache(employeeId).catch((error) =>
      console.error(
        `Failed to invalidate cache for user ${employeeId}:`,
        error,
      ),
    );

    return updatedUser;
  }

  private async getCachedUserData(employeeId: string): Promise<User | null> {
    const cacheKey = `user:${employeeId}`;
    let cachedUser = await getCacheData(cacheKey);

    if (cachedUser) {
      console.log(`User data found in cache for key: ${cacheKey}`);
      return JSON.parse(cachedUser);
    }

    console.log(
      `User data not found in cache for key: ${cacheKey}, fetching from database`,
    );
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });

    if (user) {
      console.log(`Caching user data for key: ${cacheKey}`);
      await setCacheData(cacheKey, JSON.stringify(user), USER_CACHE_TTL);
      cachedUser = JSON.stringify(user);
    }

    return cachedUser ? JSON.parse(cachedUser) : null;
  }

  private parseShiftTime(timeString: string, date: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
  }

  public async isCheckInOutAllowed(
    employeeId: string,
    inPremises: boolean,
    address: string,
  ): Promise<CheckInOutAllowance> {
    try {
      // 1. Fetch necessary data
      const user = await this.getCachedUserData(employeeId);
      if (!user)
        throw new AppError({
          code: ErrorCode.USER_NOT_FOUND,
          message: 'User not found',
        });

      const now = getCurrentTime();
      const today = startOfDay(now);

      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          employeeId,
          now,
        );
      if (!shiftData)
        return this.createResponse(false, 'ไม่พบข้อมูลกะการทำงานของคุณ', {
          inPremises,
          address,
        });

      // 2. Extract relevant information
      const { effectiveShift, shiftstatus } = shiftData;
      const {
        isOutsideShift = false,
        isLate = false,
        isOvertime = false,
      } = shiftstatus || {};

      const holidays = await this.holidayService.getHolidays(today, today);
      const holidayData = holidays.find((h) => isSameDay(h.date, today));
      const isHoliday = !!holidayData;

      if (isHoliday) {
        return this.createResponse(
          false,
          'วันนี้เป็นวันหยุดนักขัตฤกษ์ ไม่สามารถลงเวลาได้',
          { inPremises, address },
        );
      }

      const isDayOff =
        isHoliday || !effectiveShift.workDays.includes(now.getDay());

      // 3. Get attendance-related data
      const [
        approvedOvertime,
        pendingOvertime,
        leaveRequest,
        pendingLeave,
        latestAttendance,
      ] = await Promise.all([
        this.overtimeService.getApprovedOvertimeRequest(employeeId, today),
        this.overtimeService.getPendingOvertimeRequests(employeeId, today),
        this.leaveService.checkUserOnLeave(employeeId, today),
        this.leaveService.hasPendingLeaveRequest(employeeId, today),
        this.getLatestAttendance(employeeId),
      ]);

      console.log('Attendance data:', {
        isOutsideShift,
        isLate,
        isOvertime,
        isHoliday,
        isDayOff,
        approvedOvertime,
        pendingOvertime,
        leaveRequest,
        pendingLeave,
        latestAttendance,
      });

      if (
        leaveRequest &&
        leaveRequest.status === 'Approved' &&
        leaveRequest.leaveFormat === 'ลาเต็มวัน'
      ) {
        return this.createResponse(
          false,
          'คุณไม่สามารถลงเวลาได้เนื่องจาก' + leaveRequest.leaveType,
          { inPremises, address },
        );
      }

      const dayOffOvertimeRequest = isDayOff
        ? await this.overtimeService.getDayOffOvertimeRequest(employeeId, now)
        : null;

      // 4. Calculate time-related variables
      const shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
      const shiftEnd = this.parseShiftTime(effectiveShift.endTime, now);
      const earlyCheckInWindow = subMinutes(
        shiftStart,
        EARLY_CHECK_IN_THRESHOLD,
      );
      const earlyCheckOutWindow = addMinutes(
        shiftEnd,
        EARLY_CHECK_OUT_THRESHOLD,
      );
      const isCheckingIn =
        !latestAttendance || !latestAttendance.regularCheckInTime;
      const isLateCheckIn = isCheckingIn && isLate;

      // 5. Check various scenarios
      if (!inPremises) {
        return this.createResponse(
          false,
          'ไม่สามารถลงเวลาได้เนื่องจากอยู่นอกสถานที่ทำงาน',
          { inPremises, address, isOutsideShift },
        );
      }

      if (isDayOff) {
        return this.handleDayOffScenario(
          dayOffOvertimeRequest,
          approvedOvertime,
          inPremises,
          address,
          now,
          latestAttendance, // Add this parameter
        );
      }

      if (pendingLeave) {
        return this.createResponse(
          false,
          'คุณมีคำขอลาที่รออนุมัติสำหรับวันนี้',
          { inPremises, address },
        );
      }

      if (approvedOvertime) {
        const response = this.handleApprovedOvertime(
          approvedOvertime,
          now,
          inPremises,
          address,
          isCheckingIn,
          latestAttendance,
        );
        if (response) return response;
      }

      if (isCheckingIn) {
        return this.handleCheckIn(
          now,
          earlyCheckInWindow,
          shiftStart,
          isLateCheckIn,
          inPremises,
          address,
          leaveRequest ? [leaveRequest] : [],
          latestAttendance,
        );
      } else {
        return this.handleCheckOut(
          now,
          earlyCheckOutWindow,
          shiftEnd,
          approvedOvertime,
          pendingOvertime,
          inPremises,
          address,
          leaveRequest ? [leaveRequest] : [],
          effectiveShift,
          latestAttendance,
        );
      }
    } catch (error) {
      console.error('Error in isCheckInOutAllowed:', error);
      return this.createResponse(
        false,
        'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์การลงเวลา',
        { inPremises, address: 'Unknown' },
      );
    }
  }

  private createResponse(
    allowed: boolean,
    reason: string,
    options: Partial<CheckInOutAllowance>,
  ): CheckInOutAllowance {
    return {
      allowed,
      reason,
      inPremises: options.inPremises ?? false,
      address: options.address ?? '',
      isAfternoonShift: options.isAfternoonShift ?? false,
      isLateCheckIn: options.isLateCheckIn ?? false,
      isLate: options.isLate ?? false,
      isOvertime: options.isOvertime ?? false,
      isEarlyCheckOut: options.isEarlyCheckOut ?? false,
      requireConfirmation: options.requireConfirmation ?? false,
      isPlannedHalfDayLeave: options.isPlannedHalfDayLeave ?? false,
      isEmergencyLeave: options.isEmergencyLeave ?? false,
      isAfterMidshift: options.isAfterMidshift ?? false,
      earlyCheckoutType: options.earlyCheckoutType,
      minutesEarly: options.minutesEarly,
      checkoutStatus: options.checkoutStatus,
      periodType: options.periodType ?? 'regular',
      isDayOffOvertime: options.isDayOffOvertime ?? false,
      isInsideShift: options.isInsideShift ?? false,
      isPendingDayOffOvertime: options.isPendingDayOffOvertime ?? false,
      actualStartTime: options.actualStartTime ?? '',
      plannedStartTime: options.plannedStartTime ?? '',
      maxCheckOutTime: options.maxCheckOutTime ?? '',
      actualEndTime: options.actualEndTime ?? '',
      plannedEndTime: options.plannedEndTime ?? '',
      missedCheckInTime: options.missedCheckInTime,
      isAutoCheckIn: options.isAutoCheckIn ?? false,
      isAutoCheckOut: options.isAutoCheckOut ?? false,
      isEarlyCheckIn: options.isEarlyCheckIn ?? false,
      isLastPeriod: options.isLastPeriod || false,
      ...options,
    };
  }

  private handleDayOffScenario(
    dayOffOvertimeRequest: any,
    approvedOvertime: ApprovedOvertime | null,
    inPremises: boolean,
    address: string,
    now: Date,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    if (approvedOvertime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
      );

      const { earlyCheckInWindow, lateCheckOutWindow } =
        this.getOvertimeWindows(overtimeStart, overtimeEnd);

      const isCheckingIn = !latestAttendance?.regularCheckInTime;

      if (isCheckingIn) {
        if (now >= earlyCheckInWindow && now <= overtimeEnd) {
          return this.createResponse(
            true,
            'คุณกำลังลงเวลาทำงานล่วงเวลาในวันหยุดที่ได้รับอนุมัติ',
            {
              isOvertime: true,
              isDayOffOvertime: approvedOvertime.isDayOffOvertime,
              isInsideShift: approvedOvertime.isInsideShiftHours,
              inPremises,
              address,
              actualStartTime:
                now >= overtimeStart
                  ? now.toISOString()
                  : overtimeStart.toISOString(), // Convert date object to string
              plannedStartTime: overtimeStart.toISOString(), // Convert date object to string
            },
          );
        }
      } else {
        // Check for missed check-in with late check-out
        const missedOvertimeCheckIn = !latestAttendance?.regularCheckInTime;
        const isLateCheckout = now <= lateCheckOutWindow;

        if (missedOvertimeCheckIn && isLateCheckout) {
          // Only allow auto check-in if within reasonable time from overtime start
          const missedTime = differenceInMinutes(now, overtimeStart);
          const MAX_MISSED_TIME = 60; // Configure this as needed

          if (missedTime <= MAX_MISSED_TIME) {
            return this.createResponse(
              true,
              'ระบบจะทำการลงเวลาเข้า-ออกงานล่วงเวลาในวันหยุดย้อนหลังให้',
              {
                isOvertime: true,
                isDayOffOvertime: approvedOvertime.isDayOffOvertime,
                isInsideShift: approvedOvertime.isInsideShiftHours,
                inPremises,
                address,
                actualStartTime: overtimeStart.toISOString(), // Convert date object to string
                actualEndTime:
                  now <= overtimeEnd
                    ? now.toISOString()
                    : overtimeEnd.toISOString(), // Convert date object to string
                requireConfirmation: true,
                isAutoCheckIn: true,
                isAutoCheckOut: true,
                missedCheckInTime: missedTime,
              },
            );
          } else {
            return this.createResponse(
              false,
              'ไม่สามารถลงเวลาได้เนื่องจากไม่ได้ลงเวลาเข้างานในวันหยุดและเวลาผ่านมานานเกินไป',
              {
                inPremises,
                address,
                missedCheckInTime: missedTime,
              },
            );
          }
        }

        // Normal check-out flow
        if (isLateCheckout && latestAttendance?.regularCheckInTime) {
          return this.createResponse(
            true,
            'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลาในวันหยุด',
            {
              isOvertime: true,
              isDayOffOvertime: approvedOvertime.isDayOffOvertime,
              isInsideShift: approvedOvertime.isInsideShiftHours,
              inPremises,
              address,
              actualEndTime:
                now <= overtimeEnd
                  ? now.toISOString()
                  : overtimeEnd.toISOString(),
              plannedEndTime: overtimeEnd.toISOString(),
            },
          );
        }
      }

      // If none of the above conditions met
      return this.createResponse(
        false,
        'คุณมาเร็วหรือช้าเกินไปสำหรับเวลาทำงานล่วงเวลาในวันหยุดที่ได้รับอนุมัติ',
        { inPremises, address },
      );
    } else if (dayOffOvertimeRequest?.status === 'pending') {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาทำงานล่วงเวลาในวันหยุด (คำขออยู่ระหว่างการพิจารณา)',
        {
          isOvertime: true,
          isPendingDayOffOvertime: true,
          inPremises,
          address,
        },
      );
    }

    return this.createResponse(
      false,
      'วันหยุด: การลงเวลาจะต้องได้รับการอนุมัติ',
      { inPremises, address },
    );
  }

  private handleApprovedOvertime(
    approvedOvertime: ApprovedOvertime,
    now: Date,
    inPremises: boolean,
    address: string,
    isCheckingIn: boolean,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance | null {
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
    );
    const overtimeEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
    );

    const { earlyCheckInWindow, lateCheckOutWindow } = this.getOvertimeWindows(
      overtimeStart,
      overtimeEnd,
    );

    if (isCheckingIn) {
      const canCheckIn = now >= earlyCheckInWindow && now <= overtimeEnd;

      if (canCheckIn) {
        return this.createResponse(
          true,
          'คุณกำลังลงเวลาทำงานล่วงเวลาที่ได้รับอนุมัติ',
          {
            isOvertime: true,
            inPremises,
            address,
            isDayOffOvertime: approvedOvertime.isDayOffOvertime,
            isInsideShift: approvedOvertime.isInsideShiftHours,
            actualStartTime:
              now >= overtimeStart
                ? now.toISOString()
                : overtimeStart.toISOString(),
            plannedStartTime: overtimeStart.toISOString(),
            maxCheckOutTime: overtimeEnd.toISOString(),
            isLateCheckIn:
              now > addMinutes(overtimeStart, LATE_CHECK_IN_THRESHOLD),
          },
        );
      }
    } else {
      // Check for missed check-in with late check-out
      const missedOvertimeCheckIn = !latestAttendance?.regularCheckInTime;
      const isLateCheckout = now <= lateCheckOutWindow;

      if (missedOvertimeCheckIn && isLateCheckout) {
        const missedTime = differenceInMinutes(now, overtimeStart);
        const MAX_MISSED_TIME = 60;

        if (missedTime <= MAX_MISSED_TIME) {
          return this.createResponse(
            true,
            'ระบบจะทำการลงเวลาเข้า-ออกงานล่วงเวลาย้อนหลังให้',
            {
              isOvertime: true,
              inPremises,
              address,
              isDayOffOvertime: approvedOvertime.isDayOffOvertime,
              isInsideShift: approvedOvertime.isInsideShiftHours,
              actualStartTime: overtimeStart.toISOString(),
              actualEndTime: min([now, overtimeEnd]).toISOString(),
              requireConfirmation: true,
              isAutoCheckIn: true,
              isAutoCheckOut: true,
              missedCheckInTime: missedTime,
              plannedStartTime: overtimeStart.toISOString(),
              plannedEndTime: overtimeEnd.toISOString(),
              maxCheckOutTime: overtimeEnd.toISOString(),
            },
          );
        }
      }

      // Normal check-out flow
      if (isLateCheckout && latestAttendance?.regularCheckInTime) {
        return this.createResponse(
          true,
          'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลา',
          {
            isOvertime: true,
            inPremises,
            address,
            isDayOffOvertime: approvedOvertime.isDayOffOvertime,
            isInsideShift: approvedOvertime.isInsideShiftHours,
            actualStartTime: latestAttendance.regularCheckInTime.toISOString(),
            actualEndTime: min([now, overtimeEnd]).toISOString(),
            plannedStartTime: overtimeStart.toISOString(),
            plannedEndTime: overtimeEnd.toISOString(),
            maxCheckOutTime: overtimeEnd.toISOString(),
            isLateCheckIn: isAfter(
              latestAttendance.regularCheckInTime,
              addMinutes(overtimeStart, LATE_CHECK_IN_THRESHOLD),
            ),
          },
        );
      }
    }
    return null;
  }

  private determineHalfDayLeaveContext(
    leaveRequests: LeaveRequest[],
    latestAttendance: AttendanceRecord | null,
    now: Date,
    shiftMidpoint: Date,
  ): HalfDayLeaveContext {
    const halfDayLeave = leaveRequests.find(
      (leave) =>
        leave.status === 'Approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(new Date(leave.startDate), now),
    );

    const checkInTime = latestAttendance?.regularCheckInTime
      ? new Date(latestAttendance.regularCheckInTime)
      : null;

    return {
      hasHalfDayLeave: !!halfDayLeave,
      checkInTime,
      // Morning leave is confirmed if they try to check in after midpoint with no previous check-in
      isMorningLeaveConfirmed:
        !!halfDayLeave && !checkInTime && isAfter(now, shiftMidpoint),
      // Afternoon leave is confirmed if they checked in before midpoint and try to leave around midpoint
      isAfternoonLeaveConfirmed:
        !!halfDayLeave && !!checkInTime && isBefore(checkInTime, shiftMidpoint),
    };
  }

  private handleCheckIn(
    now: Date,
    earlyCheckInWindow: Date,
    shiftStart: Date,
    isLate: boolean,
    inPremises: boolean,
    address: string,
    leaveRequests: LeaveRequest[] = [],
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    console.log('HandleCheckIn parameters:', {
      now: now.toISOString(),
      shiftStart: shiftStart.toISOString(),
      isLate,
      hasLeaveRequests: leaveRequests.length > 0,
    });

    const shiftEnd = addHours(shiftStart, 8);
    const shiftMidpoint = new Date(
      shiftStart.getTime() + (shiftEnd.getTime() - shiftStart.getTime()) / 2,
    );

    // Get half-day leave context
    const leaveContext = this.determineHalfDayLeaveContext(
      leaveRequests,
      latestAttendance,
      now,
      shiftMidpoint,
    );

    console.log('Half-day leave context:', leaveContext);

    // Handle morning leave confirmation
    if (leaveContext.isMorningLeaveConfirmed) {
      return this.createResponse(true, 'คุณกำลังลงเวลาเข้างานช่วงบ่าย', {
        inPremises,
        address,
        isAfternoonShift: true,
        isLateCheckIn: false,
        isLate: false,
      });
    }

    // Check for too early
    if (now < earlyCheckInWindow) {
      const minutesUntilAllowed = Math.ceil(
        differenceInMinutes(earlyCheckInWindow, now),
      );
      return this.createResponse(
        false,
        `คุณกำลังเข้างานก่อนเวลาโดยไม่ได้รับการอนุมัติ กรุณารอ ${minutesUntilAllowed} นาทีเพื่อเข้างาน`,
        {
          countdown: minutesUntilAllowed,
          inPremises,
          address,
          isAfternoonShift: false,
        },
      );
    }

    // Early but acceptable check-in
    if (isAfter(now, earlyCheckInWindow) && isBefore(now, shiftStart)) {
      return this.createResponse(
        true,
        'คุณกำลังเข้างานก่อนเวลา ระบบจะบันทึกเวลาเข้างานตามกะการทำงาน',
        {
          isEarlyCheckIn: true,
          inPremises,
          address,
          isAfternoonShift: false,
        },
      );
    }

    // Late check-in
    if (isLate && !leaveContext.hasHalfDayLeave) {
      return this.createResponse(true, 'คุณกำลังลงเวลาเข้างานสาย', {
        isLateCheckIn: true,
        inPremises,
        address,
        isAfternoonShift: false,
      });
    }

    // Normal check-in
    return this.createResponse(true, 'คุณกำลังลงเวลาเข้างาน', {
      inPremises,
      address,
      isAfternoonShift: false,
      isLate: false,
    });
  }

  private handleCheckOut(
    now: Date,
    earlyCheckOutWindow: Date,
    shiftEnd: Date,
    approvedOvertime: ApprovedOvertime | null,
    pendingOvertime: any,
    inPremises: boolean,
    address: string,
    leaveRequests: LeaveRequest[],
    effectiveShift: ShiftData,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    // Already checked out
    if (latestAttendance?.regularCheckOutTime) {
      return this.createResponse(false, 'คุณได้ลงเวลาออกงานแล้ว', {
        inPremises,
        address,
      });
    }

    const shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
    const shiftMidpoint = new Date(
      (shiftStart.getTime() + shiftEnd.getTime()) / 2,
    );

    // Get checkout windows
    const { earlyCheckoutStart, regularCheckoutEnd } =
      this.getCheckoutWindow(shiftEnd);

    // Check if this is an early checkout
    const isEarlyCheckout = this.isEarlyCheckout(now, shiftEnd);
    const minutesEarly = isEarlyCheckout
      ? Math.abs(differenceInMinutes(now, shiftEnd))
      : 0;
    const checkoutStatus = this.getCheckoutStatus(now, shiftEnd);

    // Handle checkout based on timing
    if (checkoutStatus === 'very_early') {
      if (now < shiftMidpoint) {
        return this.createResponse(
          true,
          'คุณกำลังจะลงเวลาออกก่อนเวลาเที่ยง ระบบจะทำการยื่นคำขอลาป่วยเต็มวันให้อัตโนมัติ',
          {
            inPremises,
            address,
            requireConfirmation: true,
            isEarlyCheckOut: true,
            isEmergencyLeave: true,
            minutesEarly,
            checkoutStatus: 'very_early',
          },
        );
      } else {
        return this.createResponse(
          false,
          'ไม่สามารถลงเวลาออกก่อนเวลาเลิกงานได้ กรุณาติดต่อฝ่ายบุคคล',
          {
            inPremises,
            address,
            isEarlyCheckOut: true,
            isAfterMidshift: true,
            checkoutStatus: 'very_early',
            minutesEarly,
          },
        );
      }
    }

    // Rest of your existing handleCheckOut logic...
    const leaveContext = this.determineHalfDayLeaveContext(
      leaveRequests,
      latestAttendance,
      now,
      shiftMidpoint,
    );

    // Handle half-day leave check-out around midshift
    if (leaveContext.hasHalfDayLeave) {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาออกงานสำหรับช่วงเช้า (ลาครึ่งวันช่วงบ่าย)',
        {
          inPremises,
          address,
          isMorningShift: true,
          isApprovedEarlyCheckout: true,
          isPlannedHalfDayLeave: true,
          checkoutStatus,
        },
      );
    }

    // Handle overtime
    if (approvedOvertime) {
      const isOvertime = this.isOvertimeCheckOut(
        now,
        shiftEnd,
        approvedOvertime,
      );
      if (isOvertime) {
        return this.createResponse(
          true,
          'คุณกำลังลงเวลาออกงาน (ทำงานล่วงเวลาที่ได้รับอนุมัติ)',
          {
            isOvertime: true,
            inPremises,
            address,
            checkoutStatus,
          },
        );
      }
    }

    // Handle normal checkout windows
    if (checkoutStatus === 'normal') {
      return this.createResponse(true, 'คุณกำลังลงเวลาออกงาน', {
        inPremises,
        address,
        checkoutStatus: 'normal',
      });
    }

    if (checkoutStatus === 'late') {
      return this.createResponse(true, 'คุณกำลังลงเวลาออกงานช้า', {
        isLateCheckOut: true,
        inPremises,
        address,
        checkoutStatus: 'late',
      });
    }

    // Default case for early but within window
    return this.createResponse(true, 'คุณกำลังลงเวลาออกงาน', {
      inPremises,
      address,
      isEarlyCheckOut: true,
      checkoutStatus: 'early',
      minutesEarly,
    });
  }

  private getCheckoutWindow(shiftEnd: Date): {
    earlyCheckoutStart: Date;
    regularCheckoutEnd: Date;
  } {
    return {
      earlyCheckoutStart: subMinutes(shiftEnd, EARLY_CHECK_OUT_THRESHOLD),
      regularCheckoutEnd: addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
    };
  }

  private isEarlyCheckout(checkOutTime: Date, shiftEnd: Date): boolean {
    return differenceInMinutes(checkOutTime, shiftEnd) < 0;
  }

  private getCheckoutStatus(
    checkOutTime: Date,
    shiftEnd: Date,
  ): 'very_early' | 'early' | 'normal' | 'late' {
    const { earlyCheckoutStart, regularCheckoutEnd } =
      this.getCheckoutWindow(shiftEnd);

    if (checkOutTime < earlyCheckoutStart) {
      return 'very_early';
    } else if (checkOutTime < shiftEnd) {
      return 'early';
    } else if (checkOutTime <= regularCheckoutEnd) {
      return 'normal';
    } else {
      return 'late';
    }
  }

  async processAttendance(
    attendanceData: AttendanceData,
  ): Promise<ProcessedAttendance> {
    try {
      console.log(
        'Starting processAttendance with data:',
        JSON.stringify(attendanceData),
      );

      // Resolve employeeId from lineUserId if needed
      if (!attendanceData.employeeId && attendanceData.lineUserId) {
        const user = await this.prisma.user.findUnique({
          where: { lineUserId: attendanceData.lineUserId },
        });
        if (user) {
          attendanceData.employeeId = user.employeeId;
        }
      }

      if (!attendanceData.employeeId) {
        throw new Error('Employee ID is required');
      }

      const user = await this.getCachedUserData(attendanceData.employeeId);
      if (!user) {
        throw new Error('User not found');
      }

      // Prepare check time and determine attendance date
      const { isCheckIn, checkTime } = attendanceData;
      let parsedCheckTime = new Date(checkTime);
      let attendanceDate = startOfDay(parsedCheckTime);

      // Adjust date for after-midnight check-outs
      if (!isCheckIn && parsedCheckTime.getHours() < 4) {
        attendanceDate = subDays(attendanceDate, 1);
      }

      // Get shift data
      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          user.employeeId,
          attendanceDate,
        );
      if (!shiftData || !shiftData.effectiveShift) {
        throw new Error('Effective shift not found');
      }

      const { effectiveShift } = shiftData;
      const shiftStart = this.parseShiftTime(
        effectiveShift.startTime,
        attendanceDate,
      );
      const shiftEnd = this.parseShiftTime(
        effectiveShift.endTime,
        attendanceDate,
      );

      // Handle overnight shifts
      const isOvernightShift = this.isOvernightShift(shiftStart, shiftEnd);
      if (isOvernightShift) {
        parsedCheckTime = this.adjustDateForOvernightShift(
          parsedCheckTime,
          isCheckIn,
          shiftStart,
          shiftEnd,
        );
      }

      // Get relevant data for attendance processing
      const [isHoliday, leaveRequest, approvedOvertimeRequest] =
        await Promise.all([
          this.holidayService.isHoliday(
            attendanceDate,
            await this.holidayService.getHolidays(
              attendanceDate,
              attendanceDate,
            ),
            user.shiftCode === 'SHIFT104',
          ),
          this.leaveService.checkUserOnLeave(user.employeeId, attendanceDate),
          this.overtimeService.getApprovedOvertimeRequest(
            user.employeeId,
            attendanceDate,
          ),
        ]);

      // Get initial attendance separately so we can modify it
      let existingAttendance = await this.getLatestAttendance(user.employeeId);

      // Initialize status values
      let status: AttendanceStatusValue = 'absent';
      let isOvertime = false;
      let isEarlyCheckIn = false;
      let isLateCheckIn = false;
      let isLateCheckOut = false;
      let overtimeInfo: OvertimeInfo | undefined;
      let overtimeBounds: {
        plannedStartTime: Date;
        plannedEndTime: Date;
      } | null = null;

      // Validate check-in/out sequence
      if (isCheckIn) {
        if (existingAttendance?.regularCheckInTime) {
          throw new Error('Already checked in for today');
        }
      } else {
        if (!existingAttendance || !existingAttendance.regularCheckInTime) {
          throw new Error('Cannot check out without checking in first');
        }
      }

      // Handle special cases (holiday, leave)
      if (isHoliday) {
        status = 'holiday';
      } else if (leaveRequest && leaveRequest.status === 'approved') {
        status = 'off';
      } else {
        // Process regular attendance or overtime
        if (approvedOvertimeRequest) {
          const overtimeStart = parseISO(
            `${format(attendanceDate, 'yyyy-MM-dd')}T${approvedOvertimeRequest.startTime}`,
          );
          const overtimeEnd = parseISO(
            `${format(attendanceDate, 'yyyy-MM-dd')}T${approvedOvertimeRequest.endTime}`,
          );

          overtimeBounds = {
            plannedStartTime: overtimeStart,
            plannedEndTime: overtimeEnd,
          };

          if (isCheckIn) {
            // For check-in, use the later of actual check-in or overtime start
            parsedCheckTime = max([parsedCheckTime, overtimeStart]);
            isLateCheckIn = isAfter(
              parsedCheckTime,
              addMinutes(overtimeStart, LATE_CHECK_IN_THRESHOLD),
            );
            status = 'incomplete';
          } else {
            // For check-out, handle missed check-in and bound by overtime end
            if (!existingAttendance?.regularCheckInTime) {
              existingAttendance = await this.updateOrCreateAttendanceRecord(
                user.employeeId,
                attendanceDate,
                overtimeStart,
                true,
                'incomplete',
                false,
                false,
                false,
              );
            }
            // Ensure checkout time doesn't exceed overtime end
            parsedCheckTime = min([parsedCheckTime, overtimeEnd]);
          }

          const isWithinOvertimeWindow = isCheckIn
            ? isAfter(
                parsedCheckTime,
                subMinutes(overtimeStart, EARLY_CHECK_IN_THRESHOLD),
              )
            : isAfter(parsedCheckTime, overtimeStart);

          if (isWithinOvertimeWindow) {
            isOvertime = true;
            status = 'overtime';
            overtimeInfo = {
              isDayOffOvertime: approvedOvertimeRequest.isDayOffOvertime,
              isInsideShiftHours: approvedOvertimeRequest.isInsideShiftHours,
              startTime: approvedOvertimeRequest.startTime,
              endTime: approvedOvertimeRequest.endTime,
            };
          }
        } else {
          // Regular attendance processing
          if (isCheckIn) {
            status = 'incomplete';
            isEarlyCheckIn = isBefore(parsedCheckTime, shiftStart);
            isLateCheckIn = isAfter(
              parsedCheckTime,
              addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD),
            );
          } else {
            isLateCheckOut = isAfter(
              parsedCheckTime,
              addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
            );
            status = 'present';
          }
        }
      }

      // Create or update attendance record
      const attendanceRecord = await this.updateOrCreateAttendanceRecord(
        user.employeeId,
        attendanceDate,
        parsedCheckTime,
        isCheckIn,
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
      );

      // Create overtime entry if checking out with overtime
      if (!isCheckIn && isOvertime && existingAttendance && overtimeBounds) {
        await this.prisma.overtimeEntry.create({
          data: {
            attendanceId: existingAttendance.id,
            overtimeRequestId: approvedOvertimeRequest!.id,
            actualStartTime: max([
              existingAttendance.regularCheckInTime!,
              overtimeBounds.plannedStartTime,
            ]),
            actualEndTime: parsedCheckTime, // Already bounded by overtimeEnd
          },
        });
      }

      // Process time entry with proper formatting
      const processedAttendance = await this.processTimeEntry(
        attendanceRecord,
        isCheckIn,
        approvedOvertimeRequest,
        leaveRequest ? [leaveRequest] : [],
        overtimeBounds,
      );

      // Invalidate caches
      await Promise.all([
        this.invalidateAttendanceCache(attendanceData.employeeId),
        this.shiftManagementService.invalidateShiftCache(
          attendanceData.employeeId,
        ),
      ]);

      console.log('Processed attendance:', JSON.stringify(processedAttendance));
      return processedAttendance;
    } catch (error) {
      console.error('Error in processAttendance:', error);
      throw new Error(
        `Error processing attendance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async processTimeEntry(
    attendanceRecord: AttendanceRecord,
    isCheckIn: boolean,
    approvedOvertimeRequest: ApprovedOvertime | null,
    leaveRequests: LeaveRequest[] = [],
    overtimeBounds: {
      plannedStartTime: Date;
      plannedEndTime: Date;
    } | null = null,
  ): Promise<ProcessedAttendance> {
    // Create normalized attendance record with proper types
    const normalizedAttendance: BaseAttendance = {
      ...attendanceRecord,
      checkInAddress: attendanceRecord.checkInAddress || null,
      checkOutAddress: attendanceRecord.checkOutAddress || null,
      checkInLocation: attendanceRecord.checkInLocation || null,
      checkOutLocation: attendanceRecord.checkOutLocation || null,
      ...(attendanceRecord.checkInReason && {
        checkInReason: attendanceRecord.checkInReason,
      }),
      ...(attendanceRecord.checkInPhoto && {
        checkInPhoto: attendanceRecord.checkInPhoto,
      }),
      ...(attendanceRecord.checkOutPhoto && {
        checkOutPhoto: attendanceRecord.checkOutPhoto,
      }),
    };

    // Create enhanced attendance record for time entry
    const enhancedAttendance: EnhancedAttendanceRecord = {
      ...normalizedAttendance,
      overtimeEntries: attendanceRecord.overtimeEntries,
      timeEntries: attendanceRecord.timeEntries,
      ...(overtimeBounds && { overtimeBounds }),
    };

    // Create or update time entry with enhanced record
    const timeEntry = await this.timeEntryService.createOrUpdateTimeEntry(
      enhancedAttendance,
      isCheckIn,
      approvedOvertimeRequest,
      leaveRequests,
    );

    // Format time entry data with proper type handling
    const formattedTimeEntry: FormattedTimeEntry = {
      regularHours: Number(timeEntry.regularHours) || 0,
      overtimeHours: Number(timeEntry.overtimeHours) || 0,
      status: this.normalizeTimeEntryStatus(timeEntry.status),
      entryType: timeEntry.entryType as 'regular' | 'overtime', // Type assertion to ensure the correct type
    };

    // Build processed attendance with better type handling
    const processedAttendance: ProcessedAttendance = {
      id: attendanceRecord.id,
      employeeId: attendanceRecord.employeeId,
      date: attendanceRecord.date,
      status: this.normalizeAttendanceStatus(attendanceRecord.status),
      regularHours: formattedTimeEntry.regularHours,
      overtimeHours: formattedTimeEntry.overtimeHours,
      regularCheckInTime: attendanceRecord.regularCheckInTime ?? undefined,
      regularCheckOutTime: attendanceRecord.regularCheckOutTime ?? undefined,
      detailedStatus: this.generateDetailedStatus(
        this.normalizeAttendanceStatus(attendanceRecord.status),
        isCheckIn,
        Boolean(attendanceRecord.isEarlyCheckIn),
        Boolean(attendanceRecord.isLateCheckIn),
        Boolean(attendanceRecord.isLateCheckOut),
        Boolean(approvedOvertimeRequest),
        Boolean(
          overtimeBounds?.plannedEndTime &&
            isAfter(
              overtimeBounds.plannedEndTime,
              endOfDay(attendanceRecord.date),
            ),
        ),
        attendanceRecord as Attendance, // Cast attendanceRecord to Attendance type
      ),
      attendanceStatusType: this.mapStatusToAttendanceStatusType(
        this.normalizeAttendanceStatus(attendanceRecord.status),
        isCheckIn,
        Boolean(approvedOvertimeRequest),
      ),
    };

    // Add overtime information if present
    if (approvedOvertimeRequest) {
      processedAttendance.overtime = {
        isDayOffOvertime: approvedOvertimeRequest.isDayOffOvertime,
        isInsideShiftHours: approvedOvertimeRequest.isInsideShiftHours,
        startTime: approvedOvertimeRequest.startTime,
        endTime: approvedOvertimeRequest.endTime,
        actualStartTime:
          attendanceRecord.regularCheckInTime ??
          parseISO(
            `${format(attendanceRecord.date, 'yyyy-MM-dd')}T${approvedOvertimeRequest.startTime}`,
          ),
        actualEndTime:
          attendanceRecord.regularCheckOutTime ??
          parseISO(
            `${format(attendanceRecord.date, 'yyyy-MM-dd')}T${approvedOvertimeRequest.endTime}`,
          ),
      };
    }

    return processedAttendance;
  }

  async processCheckInOut(
    employeeId: string,
    timestamp: Date,
    isCheckIn: boolean,
    isOvertime: boolean,
  ): Promise<void> {
    const attendance = await this.getOrCreateAttendanceForDate(
      employeeId,
      timestamp,
    );

    const approvedOvertimeRequest =
      await this.overtimeService.getApprovedOvertimeRequest(
        employeeId,
        timestamp,
      );

    // Get overtime bounds if applicable
    const overtimeBounds = approvedOvertimeRequest
      ? {
          plannedStartTime: parseISO(
            `${format(timestamp, 'yyyy-MM-dd')}T${approvedOvertimeRequest.startTime}`,
          ),
          plannedEndTime: parseISO(
            `${format(timestamp, 'yyyy-MM-dd')}T${approvedOvertimeRequest.endTime}`,
          ),
        }
      : null;

    if (isOvertime) {
      // Bound the timestamp within overtime limits if checking out
      const boundedTimestamp =
        !isCheckIn && overtimeBounds
          ? min([timestamp, overtimeBounds.plannedEndTime])
          : timestamp;

      await this.overtimeService.processOvertimeCheckInOut(
        attendance,
        boundedTimestamp,
        isCheckIn,
      );
    } else {
      await this.processRegularCheckInOut(attendance, timestamp, isCheckIn);
    }

    // Update attendance after processing check in/out
    const attendanceToUpdate = {
      ...attendance,
      checkInReason: attendance.checkInReason ?? null,
      checkInPhoto: attendance.checkInPhoto ?? null,
      checkOutPhoto: attendance.checkOutPhoto ?? null,
    };

    // Pass the modified object to updateAttendance
    const updatedAttendance = await this.updateAttendance(attendanceToUpdate);
    // Ensure properties are either string or null, not undefined
    const enhancedAttendance: EnhancedAttendanceRecord = {
      ...updatedAttendance,
      overtimeEntries: updatedAttendance.overtimeEntries,
      timeEntries: updatedAttendance.timeEntries,
      ...(overtimeBounds && { overtimeBounds }),
      checkInReason: updatedAttendance.checkInReason ?? null,
      checkInPhoto: updatedAttendance.checkInPhoto ?? null,
      checkOutPhoto: updatedAttendance.checkOutPhoto ?? null, // Ensure checkOutPhoto is null if undefined
    };

    await this.timeEntryService.createOrUpdateTimeEntry(
      enhancedAttendance,
      isCheckIn,
      approvedOvertimeRequest,
    );
  }

  private async processRegularCheckInOut(
    attendance: AttendanceRecord,
    timestamp: Date,
    isCheckIn: boolean,
  ): Promise<AttendanceRecord> {
    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        attendance.employeeId,
        attendance.date,
      );

    if (!shiftData?.effectiveShift) {
      throw new Error('Effective shift not found');
    }

    const { effectiveShift } = shiftData;
    const shiftStart = this.parseShiftTime(
      effectiveShift.startTime,
      attendance.date,
    );
    const shiftEnd = this.parseShiftTime(
      effectiveShift.endTime,
      attendance.date,
    );

    // Get overtime context
    const overtimeRequest =
      await this.overtimeService.getApprovedOvertimeRequest(
        attendance.employeeId,
        attendance.date,
      );

    // Calculate late status first
    let lateStatus = {
      isLateCheckOut: false,
      isVeryLateCheckOut: false,
      minutesLate: 0,
    };

    if (!isCheckIn) {
      // If there's overtime, use overtime end for late calculation
      const effectiveEndTime = overtimeRequest
        ? parseISO(
            `${format(attendance.date, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
          )
        : shiftEnd;

      lateStatus = this.calculateLateCheckOutStatus(
        timestamp,
        effectiveEndTime,
      );
    }

    // Prepare update data
    const updateData: Prisma.AttendanceUpdateInput = {
      regularCheckInTime: isCheckIn ? timestamp : undefined,
      regularCheckOutTime: !isCheckIn ? timestamp : undefined,
      isEarlyCheckIn: isCheckIn
        ? this.isEarlyCheckIn(timestamp, shiftStart)
        : undefined,
      isLateCheckIn: isCheckIn
        ? this.isLateCheckIn(timestamp, shiftStart)
        : undefined,
      ...(!isCheckIn && {
        isLateCheckOut: lateStatus.isLateCheckOut,
        isVeryLateCheckOut: lateStatus.isVeryLateCheckOut,
        lateCheckOutMinutes: lateStatus.minutesLate,
      }),
      status: this.calculateAttendanceStatus(attendance, effectiveShift),
    };

    const updatedAttendance = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: updateData,
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    // Create overtime entry if applicable
    if (overtimeRequest && !isCheckIn) {
      const overtimeStart = parseISO(
        `${format(attendance.date, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(attendance.date, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
      );

      await this.prisma.overtimeEntry.create({
        data: {
          attendanceId: updatedAttendance.id,
          overtimeRequestId: overtimeRequest.id,
          actualStartTime: max([
            updatedAttendance.regularCheckInTime!,
            overtimeStart,
          ]),
          actualEndTime: min([timestamp, overtimeEnd]),
        },
      });
    }

    return this.toAttendanceRecord(updatedAttendance);
  }

  private calculateAttendanceStatus(
    attendance: AttendanceRecord,
    shift: ShiftData,
  ): AttendanceStatusValue {
    if (!attendance.regularCheckInTime) return 'absent';
    if (!attendance.regularCheckOutTime) return 'incomplete';

    const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);
    const isOvertime = isAfter(attendance.regularCheckOutTime, shiftEnd);

    if (isOvertime) return 'overtime';
    return 'present';
  }

  private isLateCheckIn(timestamp: Date, shiftStart: Date): boolean {
    return isAfter(timestamp, addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD));
  }

  private isEarlyCheckIn(timestamp: Date, shiftStart: Date): boolean {
    return isBefore(
      timestamp,
      subMinutes(shiftStart, EARLY_CHECK_IN_THRESHOLD),
    );
  }

  private isLateCheckOut(timestamp: Date, shiftEnd: Date): boolean {
    return isAfter(timestamp, addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD));
  }

  private isOvertimeCheckOut(
    checkOutTime: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): boolean {
    if (isAfter(checkOutTime, shiftEnd)) {
      if (approvedOvertimeRequest) {
        const overtimeStart = parseISO(
          `${format(checkOutTime, 'yyyy-MM-dd')}T${approvedOvertimeRequest.startTime}`,
        );
        const overtimeEnd = parseISO(
          `${format(checkOutTime, 'yyyy-MM-dd')}T${approvedOvertimeRequest.endTime}`,
        );
        return isWithinInterval(checkOutTime, {
          start: overtimeStart,
          end: overtimeEnd,
        });
      }
      return true; // Consider it overtime even without approval, but it might be flagged differently
    }
    return false;
  }

  private toAttendanceRecord(
    attendance: Prisma.AttendanceGetPayload<{
      include: {
        overtimeEntries: true;
        timeEntries: true;
      };
    }>,
  ): AttendanceRecord {
    return {
      ...attendance,
      checkInAddress: attendance.checkInAddress ?? null,
      checkOutAddress: attendance.checkOutAddress ?? null,
      checkInLocation: attendance.checkInLocation ?? null,
      checkOutLocation: attendance.checkOutLocation ?? null,
      checkInReason: attendance.checkInReason ?? null,
      checkInPhoto: attendance.checkInPhoto ?? null,
      checkOutPhoto: attendance.checkOutPhoto ?? null,
      overtimeEntries: attendance.overtimeEntries.map((entry) => ({
        id: entry.id,
        attendanceId: entry.attendanceId,
        overtimeRequestId: entry.overtimeRequestId,
        actualStartTime: entry.actualStartTime,
        actualEndTime: entry.actualEndTime,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      })),
      timeEntries: attendance.timeEntries.map((entry) => ({
        ...entry,
        status: entry.status as TimeEntryStatus,
        entryType: entry.entryType as 'regular' | 'overtime',
      })),
    };
  }

  private async updateOrCreateAttendanceRecord(
    employeeId: string,
    date: Date,
    checkTime: Date,
    isCheckIn: boolean,
    status: AttendanceStatusValue,
    isEarlyCheckIn: boolean,
    isLateCheckIn: boolean,
    isLateCheckOut: boolean,
  ): Promise<AttendanceRecord> {
    try {
      const existingAttendance = await this.prisma.attendance.findFirst({
        where: {
          employeeId,
          date: {
            gte: startOfDay(date),
            lt: endOfDay(date),
          },
        },
        include: {
          overtimeEntries: true,
          timeEntries: true,
        },
      });

      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          employeeId,
          date,
        );

      if (!shiftData?.effectiveShift) {
        throw new Error('Effective shift not found');
      }

      if (existingAttendance) {
        const updateData: Prisma.AttendanceUncheckedUpdateInput = {
          [isCheckIn ? 'regularCheckInTime' : 'regularCheckOutTime']: checkTime,
          status,
          isEarlyCheckIn,
          isLateCheckIn,
          isLateCheckOut,
        };

        const updatedAttendance = await this.prisma.attendance.update({
          where: { id: existingAttendance.id },
          data: updateData,
          include: {
            overtimeEntries: true,
            timeEntries: true,
          },
        });

        return this.toAttendanceRecord(updatedAttendance);
      } else {
        const createData: Prisma.AttendanceUncheckedCreateInput = {
          employeeId,
          date: startOfDay(date),
          [isCheckIn ? 'regularCheckInTime' : 'regularCheckOutTime']: checkTime,
          status,
          isEarlyCheckIn,
          isLateCheckIn,
          isLateCheckOut,
          isDayOff: !shiftData.effectiveShift.workDays.includes(date.getDay()),
          shiftStartTime: this.parseShiftTime(
            shiftData.effectiveShift.startTime,
            date,
          ),
          shiftEndTime: this.parseShiftTime(
            shiftData.effectiveShift.endTime,
            date,
          ),
          isVeryLateCheckOut: false,
          lateCheckOutMinutes: 0,
          version: 0,
        };

        const newAttendance = await this.prisma.attendance.create({
          data: createData,
          include: {
            overtimeEntries: true,
            timeEntries: true,
          },
        });

        return this.toAttendanceRecord(newAttendance);
      }
    } catch (error) {
      console.error('Error in updateOrCreateAttendanceRecord:', error);
      throw new Error(
        `Failed to update/create attendance record: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getLatestAttendance(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    const today = startOfDay(getCurrentTime());
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: today,
          lt: endOfDay(today),
        },
      },
      orderBy: { date: 'desc' },
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    return attendance ? this.toAttendanceRecord(attendance) : null;
  }

  private async updateAttendance(
    attendance: Attendance,
  ): Promise<AttendanceRecord> {
    const approvedOvertimeRequest =
      await this.overtimeService.getApprovedOvertimeRequest(
        attendance.employeeId,
        attendance.date,
      );

    const timeEntry = await this.timeEntryService.createOrUpdateTimeEntry(
      {
        ...attendance,
        overtimeEntries: [],
        timeEntries: [],
      },
      false,
      approvedOvertimeRequest,
    );

    const updatedAttendance = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status: attendance.status,
        version: { increment: 1 },
      },
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    return this.toAttendanceRecord(updatedAttendance);
  }

  async getOrCreateAttendanceForDate(
    employeeId: string,
    date: Date,
  ): Promise<AttendanceRecord> {
    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
      },
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    if (existingAttendance) {
      return this.toAttendanceRecord(existingAttendance);
    }

    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        employeeId,
        date,
      );
    if (!shiftData?.effectiveShift) {
      throw new Error('Effective shift not found');
    }

    const createData: Prisma.AttendanceUncheckedCreateInput = {
      employeeId,
      date: startOfDay(date),
      isDayOff: !shiftData.effectiveShift.workDays.includes(date.getDay()),
      shiftStartTime: this.parseShiftTime(
        shiftData.effectiveShift.startTime,
        date,
      ),
      shiftEndTime: this.parseShiftTime(shiftData.effectiveShift.endTime, date),
      status: 'absent',
    };

    const newAttendance = await this.prisma.attendance.create({
      data: createData,
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    return this.toAttendanceRecord(newAttendance);
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const cacheKey = `attendance:${employeeId}`;
    const cachedStatus = await getCacheData(cacheKey);

    if (cachedStatus) {
      const parsedStatus = JSON.parse(cachedStatus);
      const cacheAge = Date.now() - parsedStatus.timestamp;
      if (cacheAge < 5 * 60 * 1000) {
        // 5 minutes
        return parsedStatus;
      }
    }

    try {
      const status = await this.fetchLatestAttendanceStatus(employeeId);
      await setCacheData(
        cacheKey,
        JSON.stringify({ ...status, timestamp: Date.now() }),
        ATTENDANCE_CACHE_TTL,
      );
      return status;
    } catch (error) {
      console.error(
        `Error fetching attendance status for ${employeeId}:`,
        error,
      );
      throw new Error('Failed to fetch attendance status');
    }
  }

  private async fetchLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const user = await this.getCachedUserData(employeeId);
    if (!user) throw new Error('User not found');

    const today = startOfDay(getCurrentTime());
    const latestAttendance = await this.getLatestAttendance(employeeId);

    if (!user.shiftCode) throw new Error('User shift not found');

    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        employeeId,
        today,
      );
    if (!shiftData || !shiftData.effectiveShift)
      throw new Error('Shift not found');

    const { effectiveShift } = shiftData;

    // Get holidays for today
    const holidays = await this.holidayService.getHolidays(today, today);
    // Find holiday for today
    const holidayData = holidays.find((holiday) =>
      isSameDay(new Date(holiday.date), today),
    );
    // Determine if it's a holiday
    const isHoliday = !!holidayData;

    console.log(
      `Is holiday: ${isHoliday}`,
      holidayData
        ? {
            name: holidayData.name,
            localName: holidayData.localName,
            date: holidayData.date,
          }
        : 'No holiday data',
    );

    const leaveRequests = await this.leaveService.getLeaveRequests(employeeId);
    console.log(`Leave requests: ${JSON.stringify(leaveRequests)}`);

    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(employeeId, today);

    const futureShifts = await this.shiftManagementService.getFutureShifts(
      employeeId,
      today,
    );

    const futureOvertimes =
      await this.overtimeService.getFutureApprovedOvertimes(employeeId, today);

    const pendingLeaveRequest = await this.leaveService.hasPendingLeaveRequest(
      employeeId,
      today,
    );
    console.log(`Pending leave request: ${pendingLeaveRequest}`);

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentName: user.departmentName || '',
      employeeType: user.employeeType,
      role: user.role as UserRole,
      profilePictureUrl: user.profilePictureUrl,
      shiftId: effectiveShift.id,
      shiftCode: effectiveShift.shiftCode,
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      updatedAt: user.updatedAt ?? undefined,
    };

    return this.determineAttendanceStatus(
      userData,
      latestAttendance,
      effectiveShift,
      today,
      isHoliday,
      holidayData || null,
      leaveRequests[0],
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      pendingLeaveRequest,
    );
  }

  // Refactored determineAttendanceStatus function with clear sections
  private determineAttendanceStatus(
    user: UserData,
    attendance: AttendanceRecord | null,
    shift: ShiftData,
    now: Date,
    isHoliday: boolean,
    holidayData: Holiday | null,
    leaveRequest: LeaveRequest | null,
    approvedOvertime: ApprovedOvertime | null,
    futureShifts: Array<{ date: string; shift: ShiftData }>,
    futureOvertimes: Array<ApprovedOvertime>,
    pendingLeaveRequest: boolean,
  ): AttendanceStatusInfo {
    // 1. Initialize status variables
    const initialState = this.initializeAttendanceState();
    let {
      status,
      isCheckingIn,
      isOvertime,
      overtimeDuration,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut,
      historicalIsLateCheckIn,
    } = initialState;

    // 2. Determine shift context
    const shiftContext = this.determineShiftContext(shift, now, isHoliday);
    const { isDayOff, isWeeklyDayOff, dayOffType, shiftStart, shiftEnd } =
      shiftContext;

    // 3. Process overtime periods
    const overtimeContext = this.processOvertimePeriods(
      now,
      approvedOvertime,
      futureOvertimes,
      shift,
    );
    const {
      overtimePeriods,
      periodsValid,
      currentPeriodInfo,
      overtimeAttendances,
    } = overtimeContext;

    // 4. Update status based on attendance record
    if (attendance) {
      const attendanceStatus = this.processAttendanceRecord(
        attendance,
        shiftStart,
        shiftEnd,
        approvedOvertime,
        now,
      );

      // Update state with attendance processing results
      ({
        status,
        isCheckingIn,
        isOvertime,
        overtimeDuration,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        historicalIsLateCheckIn,
      } = attendanceStatus);
    }

    // 5. Apply special status rules
    if (isDayOff && !isOvertime) {
      ({ status, isCheckingIn } = this.applyDayOffRules(isHoliday));
    } else if (
      leaveRequest?.status === 'approved' ||
      (isHoliday && !isOvertime)
    ) {
      status = leaveRequest ? 'off' : 'holiday';
      isCheckingIn = true;
    }

    // 6. Generate detailed status
    const combinedLateCheckOut = isLateCheckOut || isOvertime;
    const detailedStatus = this.generateDetailedStatus(
      status,
      isCheckingIn,
      isEarlyCheckIn,
      isLateCheckIn,
      combinedLateCheckOut,
      isOvertime,
      this.isOvernightShift(shiftStart, shiftEnd),
      attendance as Attendance | null,
    );

    // 7. Prepare overtime entries
    const overtimeEntries = this.prepareOvertimeEntries(attendance);

    // 8. Build and return final status info
    return this.buildAttendanceStatusInfo({
      user,
      attendance,
      status,
      isCheckingIn,
      isOvertime,
      overtimeDuration,
      overtimeEntries,
      detailedStatus,
      isEarlyCheckIn,
      isLateCheckIn,
      historicalIsLateCheckIn,
      combinedLateCheckOut,
      isDayOff,
      isHoliday,
      holidayData,
      dayOffType,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      overtimeAttendances,
      currentPeriodInfo,
      pendingLeaveRequest,
    });
  }

  // Helper methods for each section:

  private initializeAttendanceState() {
    return {
      status: 'absent' as AttendanceStatusValue,
      isCheckingIn: true,
      isOvertime: false,
      overtimeDuration: 0,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      historicalIsLateCheckIn: false,
    };
  }

  private determineShiftContext(
    shift: ShiftData,
    now: Date,
    isHoliday: boolean,
  ) {
    const isDayOff = isHoliday || !shift.workDays.includes(now.getDay());
    const isWeeklyDayOff = !shift.workDays.includes(now.getDay());
    const dayOffType: 'holiday' | 'weekly' | 'none' = // Explicitly type this
      isHoliday ? 'holiday' : isWeeklyDayOff ? 'weekly' : 'none';

    return {
      isDayOff,
      isWeeklyDayOff,
      dayOffType,
      shiftStart: this.parseShiftTime(shift.startTime, now),
      shiftEnd: this.parseShiftTime(shift.endTime, now),
    };
  }

  private processAttendanceRecord(
    attendance: AttendanceRecord,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertime: ApprovedOvertime | null,
    now: Date,
  ) {
    const state = this.initializeAttendanceState();

    if (!attendance.regularCheckInTime) {
      return state;
    }

    // Process check-in status
    state.isCheckingIn = false;
    state.historicalIsLateCheckIn = isAfter(
      attendance.regularCheckInTime,
      addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD),
    );
    state.isEarlyCheckIn = isBefore(
      attendance.regularCheckInTime,
      subMinutes(shiftStart, EARLY_CHECK_IN_THRESHOLD),
    );
    state.isLateCheckIn = state.historicalIsLateCheckIn;

    // Process check-out status
    if (attendance.regularCheckOutTime) {
      state.status = state.isOvertime ? 'overtime' : 'present';
      state.isLateCheckOut = isAfter(
        attendance.regularCheckOutTime,
        addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
      );
    } else {
      state.status = 'incomplete';
      state.isLateCheckOut = isAfter(
        now,
        addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
      );
    }

    // Calculate overtime if applicable
    if (state.isOvertime && approvedOvertime) {
      state.overtimeDuration = this.calculateOvertimeDuration(
        attendance,
        approvedOvertime,
        now,
      );
    }

    return state;
  }

  private processOvertimePeriods(
    now: Date,
    approvedOvertime: ApprovedOvertime | null,
    futureOvertimes: Array<ApprovedOvertime>,
    shift: ShiftData,
  ) {
    // Create combined overtime array and filter out nulls
    const combinedOvertimes = [approvedOvertime, ...futureOvertimes].filter(
      (ot): ot is ApprovedOvertime => ot !== null,
    );

    const overtimePeriods = this.determineOvertimePeriods(
      now,
      combinedOvertimes,
    );

    const regularShift = {
      start: this.parseShiftTime(shift.startTime, now),
      end: this.parseShiftTime(shift.endTime, now),
    };

    const currentPeriodInfo = this.getCurrentPeriod(
      now,
      regularShift,
      overtimePeriods,
    );

    return {
      overtimePeriods,
      periodsValid: this.validateOvertimePeriods(regularShift, overtimePeriods),
      currentPeriodInfo,
      overtimeAttendances: [] as OvertimeAttendanceInfo[],
    };
  }

  // 1. Apply Day Off Rules
  private applyDayOffRules(isHoliday: boolean): {
    status: AttendanceStatusValue;
    isCheckingIn: boolean;
    dayOffType: 'holiday' | 'weekly' | 'none';
  } {
    const dayOffType: 'holiday' | 'weekly' | 'none' = isHoliday
      ? 'holiday'
      : 'weekly';
    return {
      status: isHoliday ? 'holiday' : 'off',
      isCheckingIn: true,
      dayOffType,
    };
  }

  // 2. Prepare Overtime Entries
  private prepareOvertimeEntries(
    attendance: AttendanceRecord | null,
  ): OvertimeEntryData[] {
    if (!attendance?.overtimeEntries?.length) {
      return [];
    }

    return attendance.overtimeEntries.map((entry) => {
      let actualStartTime = entry.actualStartTime;
      let actualEndTime = entry.actualEndTime;

      // Handle overnight overtime
      if (actualEndTime && actualEndTime < actualStartTime) {
        actualEndTime = addDays(actualEndTime, 1);
      }

      return {
        ...entry,
        actualStartTime,
        actualEndTime,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });
  }

  // 3. Build Attendance Status Info
  private buildAttendanceStatusInfo(
    params: AttendanceStatusInfoParams,
  ): AttendanceStatusInfo {
    const {
      user,
      attendance,
      status,
      isCheckingIn,
      isOvertime,
      overtimeDuration,
      overtimeEntries,
      detailedStatus,
      isEarlyCheckIn,
      isLateCheckIn,
      historicalIsLateCheckIn,
      combinedLateCheckOut,
      isDayOff,
      isHoliday,
      holidayData,
      dayOffType,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      overtimeAttendances,
      currentPeriodInfo,
      pendingLeaveRequest,
    } = params;

    // Convert Holiday to HolidayInfo
    const holidayInfo = holidayData
      ? {
          localName: holidayData.localName || '', // Convert null to empty string
          name: holidayData.name,
          date: format(holidayData.date, 'yyyy-MM-dd'),
        }
      : null;

    return {
      isDayOff,
      isHoliday,
      holidayInfo,
      dayOffType,
      status,
      isCheckingIn,
      isOvertime,
      overtimeDuration,
      overtimeEntries,
      detailedStatus,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut: combinedLateCheckOut,
      user,
      latestAttendance: attendance
        ? {
            id: attendance.id,
            employeeId: attendance.employeeId,
            date: format(attendance.date, 'yyyy-MM-dd'),
            checkInTime: attendance.regularCheckInTime
              ? format(attendance.regularCheckInTime, 'HH:mm:ss')
              : null,
            checkOutTime: attendance.regularCheckOutTime
              ? format(attendance.regularCheckOutTime, 'HH:mm:ss')
              : null,
            status: this.mapStatusToAttendanceStatusType(
              status,
              isCheckingIn,
              isOvertime,
            ),
            isManualEntry: attendance.isManualEntry,
          }
        : null,
      shiftAdjustment: null,
      approvedOvertime: approvedOvertime
        ? {
            ...approvedOvertime,
            status: approvedOvertime.status as OvertimeRequestStatus,
          }
        : null,
      futureShifts,
      futureOvertimes,
      overtimeAttendances,
      currentPeriod: currentPeriodInfo,
      pendingLeaveRequest,
    };
  }

  private calculateOvertimeDuration(
    attendance: AttendanceRecord,
    approvedOvertime: ApprovedOvertime,
    now: Date,
  ): number {
    // Delegate calculation to TimeEntryService
    return this.timeEntryService.calculateOvertimeDuration(
      attendance,
      approvedOvertime,
      now,
    );
  }

  private determineOvertimeStatus(
    overtimeRequest: OvertimeRequest,
    timeEntry: TimeEntryInfo | null,
    overtimeEntry: OvertimeEntryInfo | null,
    currentTime: Date,
    overtimeRequests: ApprovedOvertime[] = [],
  ) {
    const start = parseISO(
      `${format(currentTime, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
    );
    let end = parseISO(
      `${format(currentTime, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
    );

    if (end < start) {
      end = addDays(end, 1);
    }

    const isActive = isWithinInterval(currentTime, { start, end });
    const isPending = currentTime < start;
    const isComplete =
      timeEntry?.status === 'completed' || !!overtimeEntry?.actualEndTime;

    return {
      isPending,
      isActive,
      isNext: isPending && !isActive && !isComplete,
      isComplete,
    };
  }

  // Add new method for handling multiple overtime periods
  private determineOvertimePeriods(
    now: Date,
    overtimeRequests: ApprovedOvertime[],
  ): OvertimePeriod[] {
    return overtimeRequests
      .filter((ot) => isSameDay(ot.date, now))
      .map((ot) => {
        const start = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.startTime}`);
        let end = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.endTime}`);

        if (end < start) {
          end = addDays(end, 1);
        }

        return {
          start,
          end,
          overtimeRequest: ot,
          isActive: isWithinInterval(now, { start, end }),
          isComplete: false, // Set based on your completion logic
        };
      });
  }

  // Add validation for overtime periods
  private validateOvertimePeriods(
    regularShift: { start: Date; end: Date },
    overtimePeriods: OvertimePeriod[],
  ): boolean {
    // Sort periods by start time
    const sortedPeriods = [...overtimePeriods].sort(
      (a, b) => a.start.getTime() - b.start.getTime(),
    );

    // Check for overlaps between overtime periods
    for (let i = 1; i < sortedPeriods.length; i++) {
      if (sortedPeriods[i].start < sortedPeriods[i - 1].end) {
        return false;
      }
    }

    // Check overlap with regular shift
    return !sortedPeriods.some(
      (period) =>
        isWithinInterval(period.start, regularShift) ||
        isWithinInterval(period.end, regularShift),
    );
  }

  // Add helper to determine current period
  private getCurrentPeriod(
    now: Date,
    regularShift: { start: Date; end: Date },
    overtimePeriods: OvertimePeriod[],
  ): CurrentPeriodInfo {
    const currentOT = overtimePeriods.find((period) =>
      isWithinInterval(now, { start: period.start, end: period.end }),
    );

    if (currentOT) {
      return {
        type: 'overtime',
        overtimeId: currentOT.overtimeRequest.id,
        isComplete: currentOT.isComplete,
        checkInTime: currentOT.overtimeRequest.actualStartTime
          ? format(currentOT.overtimeRequest.actualStartTime, 'HH:mm:ss')
          : null,
        checkOutTime: currentOT.overtimeRequest.actualEndTime
          ? format(currentOT.overtimeRequest.actualEndTime, 'HH:mm:ss')
          : null,
        current: { start: currentOT.start, end: currentOT.end },
      };
    }

    return {
      type: 'regular',
      isComplete: isAfter(now, regularShift.end),
      checkInTime: null,
      checkOutTime: null,
      current: regularShift,
      next: this.getNextPeriod(now, overtimePeriods),
    };
  }

  // Helper to find the next period
  private getNextPeriod(
    now: Date,
    overtimePeriods: OvertimePeriod[],
  ): CurrentPeriodInfo['next'] | undefined {
    const nextOT = overtimePeriods
      .filter((period) => isAfter(period.start, now))
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];

    return nextOT
      ? {
          type: 'overtime',
          start: nextOT.start,
          overtimeId: nextOT.overtimeRequest.id,
        }
      : undefined;
  }

  private calculateLateCheckOutStatus(
    checkOutTime: Date,
    shiftEnd: Date,
  ): LateCheckOutStatus {
    const LATE_THRESHOLD = 15; // 15 minutes
    const VERY_LATE_THRESHOLD = 30; // 30 minutes

    const minutesLate = differenceInMinutes(checkOutTime, shiftEnd);

    return {
      isLateCheckOut: minutesLate > LATE_THRESHOLD,
      isVeryLateCheckOut: minutesLate > VERY_LATE_THRESHOLD,
      minutesLate: Math.max(0, minutesLate),
    };
  }

  private mapStatusToAttendanceStatusType(
    status: AttendanceStatusValue,
    isCheckingIn: boolean,
    isOvertime: boolean,
  ): AttendanceStatusType {
    switch (status) {
      case 'absent':
        return 'pending';
      case 'incomplete':
        return 'checked-in';
      case 'present':
        return isOvertime ? 'overtime-ended' : 'checked-out';
      case 'overtime':
        return isCheckingIn ? 'overtime-started' : 'overtime-ended';
      case 'holiday':
      case 'off':
        return 'approved';
      default:
        return 'pending';
    }
  }

  private generateDetailedStatus(
    status: AttendanceStatusValue,
    isCheckingIn: boolean,
    isEarlyCheckIn: boolean,
    isLateCheckIn: boolean,
    isLateCheckOut: boolean,
    isOvertime: boolean,
    isOvernightShift: boolean,
    latestAttendance: Attendance | null,
  ): string {
    if (status === 'holiday' || status === 'off') return status;

    const details: string[] = [];

    // Check if this is the first check-in of the day
    if (
      latestAttendance?.regularCheckInTime &&
      latestAttendance?.shiftStartTime &&
      !latestAttendance?.regularCheckOutTime
    ) {
      // Ensure both dates exist before comparison
      const checkInTime = latestAttendance.regularCheckInTime;
      const shiftStart = new Date(latestAttendance.shiftStartTime);

      if (
        isAfter(checkInTime, addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD))
      ) {
        details.push('late-check-in');
      }
    } else {
      // Handle normal flow
      if (isCheckingIn) {
        if (isEarlyCheckIn) details.push('early-check-in');
        if (isLateCheckIn) details.push('late-check-in');
      } else {
        if (isLateCheckOut) details.push('late-check-out');
        if (isOvertime) details.push('overtime');
      }
    }

    if (isOvernightShift) details.push('overnight-shift');

    return details.length > 0 ? details.join('-') : 'on-time';
  }

  private isOvernightShift(shiftStart: Date, shiftEnd: Date): boolean {
    return shiftEnd <= shiftStart;
  }

  private adjustDateForOvernightShift(
    date: Date,
    isCheckingIn: boolean,
    shiftStart: Date,
    shiftEnd: Date,
  ): Date {
    if (
      this.isOvernightShift(shiftStart, shiftEnd) &&
      !isCheckingIn &&
      date.getHours() < shiftStart.getHours()
    ) {
      return addDays(date, 1);
    }
    return date;
  }

  private getActiveOvertimePeriods(
    now: Date,
    approvedOvertimes: ApprovedOvertime[],
  ): OvertimePeriod[] {
    const currentDate = format(now, 'yyyy-MM-dd');
    const periods: OvertimePeriod[] = [];

    approvedOvertimes.forEach((overtime) => {
      // Handle same day overtime
      const start = parseISO(`${currentDate}T${overtime.startTime}`);
      let end = parseISO(`${currentDate}T${overtime.endTime}`);

      // Adjust for overnight overtime
      if (end < start) {
        end = addDays(end, 1);
      }

      periods.push({
        start,
        end,
        overtimeRequest: overtime,
        isActive: isWithinInterval(now, { start, end }),
        isComplete: !!overtime.actualEndTime,
      });
    });

    // Sort by start time
    return periods.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  private getCurrentOvertimePeriod(
    now: Date,
    approvedOvertimes: ApprovedOvertime[],
  ): OvertimePeriod | null {
    const periods = this.getActiveOvertimePeriods(now, approvedOvertimes);
    return (
      periods.find((period) =>
        isWithinInterval(now, { start: period.start, end: period.end }),
      ) || null
    );
  }

  // services/AttendanceService.ts

  private async getOvertimeTimeEntry(
    employeeId: string,
    overtimeRequest: ApprovedOvertime,
  ): Promise<TimeEntryInfo | null> {
    const timeEntry = await this.prisma.timeEntry.findFirst({
      where: {
        employeeId,
        overtimeRequestId: overtimeRequest.id,
        date: overtimeRequest.date,
      },
      include: {
        overtimeMetadata: true,
      },
    });

    if (!timeEntry) return null;

    return {
      id: timeEntry.id,
      startTime: timeEntry.startTime,
      endTime: timeEntry.endTime,
      status: timeEntry.status as 'in_progress' | 'completed',
      overtimeHours: timeEntry.overtimeHours,
      overtimeMetadata: timeEntry.overtimeMetadata
        ? {
            isInsideShiftHours: timeEntry.overtimeMetadata.isInsideShiftHours,
            isDayOffOvertime: timeEntry.overtimeMetadata.isDayOffOvertime,
          }
        : undefined,
    };
  }

  private async getOvertimeEntry(
    overtimeRequest: ApprovedOvertime,
    date: Date,
  ): Promise<OvertimeEntryInfo | null> {
    const overtimeEntry = await this.prisma.overtimeEntry.findFirst({
      where: {
        overtimeRequestId: overtimeRequest.id,
        attendance: {
          date: {
            gte: startOfDay(date),
            lt: endOfDay(date),
          },
        },
      },
    });

    if (!overtimeEntry) return null;

    return {
      id: overtimeEntry.id,
      attendanceId: overtimeEntry.attendanceId,
      overtimeRequestId: overtimeEntry.overtimeRequestId,
      actualStartTime: overtimeEntry.actualStartTime,
      actualEndTime: overtimeEntry.actualEndTime,
    };
  }

  // 1. Update the function to match OvertimeAttendanceInfo interface
  private async getOvertimeAttendance(
    employeeId: string,
    date: Date,
    overtimeRequestId: string,
  ): Promise<OvertimeAttendanceInfo | null> {
    try {
      const overtimeRequest = await this.prisma.overtimeRequest.findFirst({
        where: {
          id: overtimeRequestId,
          employeeId,
          date: {
            gte: startOfDay(date),
            lt: endOfDay(date),
          },
        },
      });

      if (!overtimeRequest) return null;

      // Cast the status to OvertimeRequestStatus
      const typedOvertimeRequest: ApprovedOvertime = {
        ...overtimeRequest,
        status: overtimeRequest.status as OvertimeRequestStatus,
      };

      // Get the attendance record for this date
      const attendance = await this.getLatestAttendance(employeeId);

      const attendanceTime = attendance
        ? {
            checkInTime: attendance.regularCheckInTime
              ? format(attendance.regularCheckInTime, 'HH:mm:ss')
              : null,
            checkOutTime: attendance.regularCheckOutTime
              ? format(attendance.regularCheckOutTime, 'HH:mm:ss')
              : null,
            status: this.mapStatusToAttendanceStatusType(
              attendance.status as AttendanceStatusValue,
              !attendance.regularCheckInTime,
              Boolean(overtimeRequest),
            ),
          }
        : null;

      const [timeEntry, overtimeEntry] = await Promise.all([
        this.getOvertimeTimeEntry(employeeId, typedOvertimeRequest),
        this.getOvertimeEntry(typedOvertimeRequest, date),
      ]);

      const periodStatus = this.determineOvertimeStatus(
        overtimeRequest,
        timeEntry,
        overtimeEntry,
        new Date(),
      );

      return {
        overtimeRequest: typedOvertimeRequest,
        attendanceTime,
        periodStatus,
      };
    } catch (error) {
      console.error('Error getting overtime attendance:', error);
      return null;
    }
  }

  async checkMissingAttendance() {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        shiftCode: { not: null },
      },
      include: {
        attendances: {
          where: {
            date: {
              gte: startOfDay(now),
              lte: endOfDay(now),
            },
          },
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    });

    for (const user of users) {
      await this.checkUserAttendance(user, now);
    }
  }

  private async checkUserAttendance(
    user: User & { attendances: Attendance[] },
    now: Date,
  ) {
    const cachedUser = await this.getCachedUserData(user.employeeId);
    if (!cachedUser) return;

    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        cachedUser.id,
        now,
      );
    if (!shiftData || !shiftData.effectiveShift) return;

    const { effectiveShift } = shiftData;
    const { shiftStart, shiftEnd } = this.getShiftTimes(effectiveShift, now);
    // Convert attendances to AttendanceRecord
    const attendanceRecords = user.attendances.map((attendance) => ({
      ...attendance,
      overtimeEntries: [], // These will be empty since we don't have the data
      timeEntries: [], // These will be empty since we don't have the data
    }));

    const latestAttendance = attendanceRecords[0];
    const isOnLeave = await this.leaveService.checkUserOnLeave(
      user.employeeId,
      now,
    );
    if (isOnLeave) return;

    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(
        user.employeeId,
        now,
      );

    // Check for missing check-in
    if (
      isAfter(now, shiftStart) &&
      isBefore(now, shiftEnd) &&
      !latestAttendance
    ) {
      await this.sendMissingCheckInNotification(user);
      return;
    }

    // Check for missing check-out
    if (
      latestAttendance &&
      latestAttendance.regularCheckInTime &&
      !latestAttendance.regularCheckOutTime
    ) {
      const checkOutTime = approvedOvertime
        ? parseISO(approvedOvertime.endTime)
        : shiftEnd;
      if (isAfter(now, addMinutes(checkOutTime, 30))) {
        await this.sendMissingCheckOutNotification(user);
      }
    }
  }

  private getOvertimeWindows(overtimeStart: Date, overtimeEnd: Date) {
    return {
      earlyCheckInWindow: subMinutes(overtimeStart, EARLY_CHECK_IN_THRESHOLD),
      lateCheckOutWindow: addMinutes(overtimeEnd, LATE_CHECK_OUT_THRESHOLD),
    };
  }

  private normalizeAttendanceStatus(status: string): AttendanceStatusValue {
    const validStatuses: AttendanceStatusValue[] = [
      'present',
      'absent',
      'incomplete',
      'holiday',
      'off',
      'overtime',
    ];

    const normalizedStatus = status.toLowerCase() as AttendanceStatusValue;
    if (validStatuses.includes(normalizedStatus)) {
      return normalizedStatus;
    }

    // Default fallback status
    console.warn(`Invalid status ${status} normalized to 'absent'`);
    return 'absent';
  }

  private normalizeTimeEntryStatus(status: string): TimeEntryStatus {
    return status.toUpperCase() === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED';
  }

  private getShiftTimes(shift: ShiftData, date: Date) {
    const shiftStart = this.parseShiftTime(shift.startTime, date);
    const shiftEnd = this.parseShiftTime(shift.endTime, date);
    return { shiftStart, shiftEnd };
  }

  private async getHolidayStatus(date: Date, user: User): Promise<boolean> {
    const cacheKey = `holiday:${format(date, 'yyyy-MM-dd')}:${user.shiftCode}`;
    let cachedResult = await getCacheData(cacheKey);

    if (cachedResult !== null) {
      return JSON.parse(cachedResult);
    }

    const holidays = await this.holidayService.getHolidays(
      startOfDay(date),
      endOfDay(date),
    );
    const isHoliday = await this.holidayService.isHoliday(
      date,
      holidays,
      user.shiftCode === 'SHIFT104',
    );

    await setCacheData(cacheKey, JSON.stringify(isHoliday), HOLIDAY_CACHE_TTL);
    return isHoliday;
  }

  private async sendMissingCheckInNotification(user: User) {
    if (user.lineUserId) {
      await this.notificationService.sendMissingCheckInNotification(
        user.employeeId,
        user.lineUserId,
      );
    }
  }

  private async sendMissingCheckOutNotification(user: User) {
    if (user.lineUserId) {
      await this.notificationService.sendMissingCheckOutNotification(
        user.employeeId,
        user.lineUserId,
      );
    }
  }
}

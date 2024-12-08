// AttendanceCheckService.ts - Check-in/out validation

import { LeaveRequest, PrismaClient, User } from '@prisma/client';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { HolidayService } from '../HolidayService';
import {
  AttendanceRecord,
  CheckInOutAllowance,
  HalfDayLeaveContext,
  ShiftData,
  ApprovedOvertimeInfo,
  AppError,
  ErrorCode,
  CheckoutStatusType,
  PeriodType,
  CACHE_CONSTANTS,
  ATTENDANCE_CONSTANTS,
} from '../../types/attendance';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../../lib/serverCache';
import { cacheService } from '../CacheService';
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  min,
  parseISO,
  startOfDay,
  subMinutes,
} from 'date-fns';
import { getCurrentTime } from '../../utils/dateUtils';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { is } from 'date-fns/locale';

export class AttendanceCheckService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly overtimeService: OvertimeServiceServer,
    private readonly leaveService: LeaveServiceServer,
    private readonly holidayService: HolidayService,
    private processingService: AttendanceProcessingService,
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
      await setCacheData(
        cacheKey,
        JSON.stringify(user),
        CACHE_CONSTANTS.USER_CACHE_TTL,
      );
      cachedUser = JSON.stringify(user);
    }

    return cachedUser ? JSON.parse(cachedUser) : null;
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

      // 2. Get all required data
      const [
        shiftData,
        holidays,
        leaveRequest,
        pendingLeave,
        approvedOvertime,
        pendingOvertime,
        latestAttendance,
      ] = await Promise.all([
        this.shiftService.getEffectiveShiftAndStatus(employeeId, now),
        this.holidayService.getHolidays(today, today),
        this.leaveService.checkUserOnLeave(employeeId, today),
        this.leaveService.hasPendingLeaveRequest(employeeId, today),
        this.overtimeService.getCurrentApprovedOvertimeRequest(
          employeeId,
          today,
        ),
        this.overtimeService.getPendingOvertimeRequests(employeeId, today),
        this.processingService.getLatestAttendance(employeeId),
      ]);

      if (!shiftData?.effectiveShift) {
        return this.createResponse(false, 'ไม่พบข้อมูลกะการทำงานของคุณ', {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
        });
      }

      const { effectiveShift, shiftstatus } = shiftData;
      const { isDayOff, isHoliday } = shiftstatus;

      // 3. Basic validations
      if (isHoliday) {
        return this.handleNonWorkingDayAttendance(
          'holiday',
          approvedOvertime,
          inPremises,
          address,
          now,
          latestAttendance,
          pendingOvertime,
        );
      }

      if (pendingLeave) {
        return this.createResponse(
          false,
          'คุณมีคำขอลาที่รออนุมัติสำหรับวันนี้',
          {
            inPremises,
            address,
            periodType: PeriodType.REGULAR,
          },
        );
      }

      if (
        leaveRequest?.status === 'Approved' &&
        leaveRequest.leaveFormat === 'ลาเต็มวัน'
      ) {
        return this.createResponse(
          false,
          `คุณไม่สามารถลงเวลาได้เนื่องจาก${leaveRequest.leaveType}`,
          {
            inPremises,
            address,
            periodType: PeriodType.REGULAR,
          },
        );
      }

      // 4. Check for day off overtime
      if (isDayOff) {
        const dayOffOvertimeRequest =
          await this.overtimeService.getDayOffOvertimeRequest(employeeId, now);

        return this.handleNonWorkingDayAttendance(
          'dayoff',
          approvedOvertime,
          inPremises,
          address,
          now,
          latestAttendance,
          dayOffOvertimeRequest,
        );
      }

      // 5. Check for active overtime period
      if (approvedOvertime) {
        const overtimeStart = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
        );
        const overtimeEnd = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
        );

        // Handle period overlap
        if (
          latestAttendance?.regularCheckOutTime &&
          this.isAtOvertimeStart(now, approvedOvertime)
        ) {
          return this.handleApprovedOvertime(
            approvedOvertime,
            now,
            inPremises,
            address,
            true,
            latestAttendance,
          )!;
        }

        if (isWithinInterval(now, { start: overtimeStart, end: overtimeEnd })) {
          return this.handleOvertimeAttendance(
            now,
            overtimeStart,
            overtimeEnd,
            approvedOvertime,
            inPremises,
            address,
            latestAttendance,
            leaveRequest ? [leaveRequest] : [],
          );
        }
      }

      // 6. Regular shift handling
      return this.handleRegularShiftAttendance(
        now,
        shiftData,
        inPremises,
        address,
        latestAttendance,
        approvedOvertime,
        leaveRequest ? [leaveRequest] : [],
        effectiveShift,
      );
    } catch (error) {
      console.error('Error in isCheckInOutAllowed:', error);
      return this.createResponse(
        false,
        'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์การลงเวลา',
        {
          inPremises,
          address: 'Unknown',
          periodType: PeriodType.REGULAR,
        },
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

      flags: {
        isOvertime: options.flags?.isOvertime ?? false,
        isDayOffOvertime: options.flags?.isDayOffOvertime ?? false,
        isPendingDayOffOvertime:
          options.flags?.isPendingDayOffOvertime ?? false,
        isPendingOvertime: options.flags?.isPendingOvertime ?? false,
        isOutsideShift: options.flags?.isOutsideShift ?? false,
        isInsideShift: options.flags?.isInsideShift ?? false,
        isLate: options.flags?.isLate ?? false,
        isEarlyCheckIn: options.flags?.isEarlyCheckIn ?? false,
        isEarlyCheckOut: options.flags?.isEarlyCheckOut ?? false,
        isLateCheckIn: options.flags?.isLateCheckIn ?? false,
        isLateCheckOut: options.flags?.isLateCheckOut ?? false,
        isVeryLateCheckOut: options.flags?.isVeryLateCheckOut ?? false,
        isAutoCheckIn: options.flags?.isAutoCheckIn ?? false,
        isAutoCheckOut: options.flags?.isAutoCheckOut ?? false,
        isAfternoonShift: options.flags?.isAfternoonShift ?? false,
        isMorningShift: options.flags?.isMorningShift ?? false,
        isAfterMidshift: options.flags?.isAfterMidshift ?? false,
        isApprovedEarlyCheckout:
          options.flags?.isApprovedEarlyCheckout ?? false,
        isPlannedHalfDayLeave: options.flags?.isPlannedHalfDayLeave ?? false,
        isEmergencyLeave: options.flags?.isEmergencyLeave ?? false,
      },

      timing: {
        countdown: options.timing?.countdown,
        lateCheckOutMinutes: options.timing?.lateCheckOutMinutes,
        minutesEarly: options.timing?.minutesEarly,
        missedCheckInTime: options.timing?.missedCheckInTime,
        checkoutStatus: options.timing?.checkoutStatus,
        earlyCheckoutType: options.timing?.earlyCheckoutType,
        actualStartTime: options.timing?.actualStartTime ?? '',
        actualEndTime: options.timing?.actualEndTime ?? '',
        plannedStartTime: options.timing?.plannedStartTime ?? '',
        plannedEndTime: options.timing?.plannedEndTime ?? '',
        maxCheckOutTime: options.timing?.maxCheckOutTime ?? '',
      },

      metadata: {
        overtimeId: options.metadata?.overtimeId,
        nextPeriod: options.metadata?.nextPeriod && {
          type: options.metadata.nextPeriod.type,
          startTime: options.metadata.nextPeriod.startTime,
          overtimeId: options.metadata.nextPeriod.overtimeId,
        },
      },

      periodType: options.periodType ?? PeriodType.REGULAR,
      isLastPeriod: options.isLastPeriod ?? false,
      requireConfirmation: options.requireConfirmation ?? false,
    };
  }

  private handleNonWorkingDayAttendance(
    type: 'holiday' | 'dayoff',
    approvedOvertime: ApprovedOvertimeInfo | null,
    inPremises: boolean,
    address: string,
    now: Date,
    latestAttendance: AttendanceRecord | null,
    pendingOvertimeRequest?: any,
  ): CheckInOutAllowance {
    // Early return if no overtime and no pending request
    if (!approvedOvertime && !pendingOvertimeRequest) {
      return this.createResponse(
        false,
        `${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}: การลงเวลาจะต้องได้รับการอนุมัติ`,
        {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
          flags: {
            isDayOffOvertime: false,
            isOvertime: false,
          },
        },
      );
    }

    // Handle pending overtime request
    if (pendingOvertimeRequest?.status === 'pending') {
      return this.createResponse(
        false,
        `คุณมีคำขอทำงานล่วงเวลาใน${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}ที่รออนุมัติ`,
        {
          inPremises,
          address,
          periodType: PeriodType.OVERTIME,
          flags: {
            isOvertime: true,
            isPendingDayOffOvertime: true,
          },
        },
      );
    }

    // From here on, we're dealing with approved overtime
    if (approvedOvertime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
      );

      // Get time windows for early check-in and late check-out
      const { earlyCheckInWindow, lateCheckOutWindow } =
        this.getOvertimeWindows(overtimeStart, overtimeEnd);

      // Check if this is a check-in attempt
      const isCheckingIn = !latestAttendance?.regularCheckInTime;

      // Time window validations
      const isWithinOvertimeWindow = isWithinInterval(now, {
        start: earlyCheckInWindow,
        end: lateCheckOutWindow,
      });

      const isWithinMainPeriod = isWithinInterval(now, {
        start: overtimeStart,
        end: overtimeEnd,
      });

      // Too early for overtime
      if (isBefore(now, earlyCheckInWindow)) {
        return this.createResponse(
          false,
          `คุณมาเร็วเกินไปสำหรับการทำงานล่วงเวลาใน${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}`,
          {
            inPremises,
            address,
            periodType: PeriodType.OVERTIME,
            flags: {
              isOvertime: true,
              isDayOffOvertime: true,
              isEarlyCheckIn: true,
            },
            timing: {
              plannedStartTime: overtimeStart.toISOString(),
            },
          },
        );
      }

      // Too late for overtime
      if (isAfter(now, lateCheckOutWindow)) {
        return this.createResponse(
          false,
          `เลยเวลาทำงานล่วงเวลาใน${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}แล้ว`,
          {
            inPremises,
            address,
            periodType: PeriodType.OVERTIME,
            flags: {
              isOvertime: true,
              isDayOffOvertime: true,
              isLateCheckOut: true,
            },
            timing: {
              plannedEndTime: overtimeEnd.toISOString(),
            },
          },
        );
      }

      // Handle Check-in
      if (isCheckingIn) {
        // Regular overtime check-in
        if (isWithinOvertimeWindow) {
          const isLateCheckIn = isAfter(
            now,
            addMinutes(
              overtimeStart,
              ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
            ),
          );

          return this.createResponse(
            true,
            `คุณกำลังลงเวลาทำงานล่วงเวลาใน${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}ที่ได้รับอนุมัติ`,
            {
              inPremises,
              address,
              periodType: PeriodType.OVERTIME,
              flags: {
                isOvertime: true,
                isDayOffOvertime: true,
                isInsideShift: approvedOvertime.isInsideShiftHours,
                isLateCheckIn,
              },
              timing: {
                actualStartTime:
                  now >= overtimeStart
                    ? now.toISOString()
                    : overtimeStart.toISOString(),
                plannedStartTime: overtimeStart.toISOString(),
              },
              metadata: {
                overtimeId: approvedOvertime.id,
              },
            },
          );
        }
      }

      // Handle Check-out scenarios
      else {
        // Handle missed check-in near period end
        const missedTime = differenceInMinutes(now, overtimeStart);
        if (missedTime <= ATTENDANCE_CONSTANTS.AUTO_CHECKOUT_WINDOW) {
          return this.createResponse(
            true,
            'ระบบจะทำการลงเวลาเข้า-ออกงานล่วงเวลาย้อนหลังให้',
            {
              inPremises,
              address,
              periodType: PeriodType.OVERTIME,
              requireConfirmation: true,
              flags: {
                isOvertime: true,
                isDayOffOvertime: true,
                isInsideShift: approvedOvertime.isInsideShiftHours,
                isAutoCheckIn: true,
                isAutoCheckOut: true,
              },
              timing: {
                actualStartTime: overtimeStart.toISOString(),
                actualEndTime: min([now, overtimeEnd]).toISOString(),
                missedCheckInTime: missedTime,
              },
              metadata: {
                overtimeId: approvedOvertime.id,
              },
            },
          );
        }

        // Regular overtime check-out
        if (isWithinOvertimeWindow) {
          const isEarlyCheckOut = isBefore(now, overtimeEnd);
          const minutesEarly = isEarlyCheckOut
            ? differenceInMinutes(overtimeEnd, now)
            : 0;

          return this.createResponse(
            true,
            `คุณกำลังลงเวลาออกจากการทำงานล่วงเวลาใน${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}`,
            {
              inPremises,
              address,
              periodType: PeriodType.OVERTIME,
              flags: {
                isOvertime: true,
                isDayOffOvertime: true,
                isInsideShift: approvedOvertime.isInsideShiftHours,
                isEarlyCheckOut,
              },
              timing: {
                actualEndTime: now.toISOString(),
                plannedEndTime: overtimeEnd.toISOString(),
                minutesEarly: isEarlyCheckOut ? minutesEarly : 0,
                checkoutStatus: this.getCheckoutStatus(now, overtimeEnd),
              },
              metadata: {
                overtimeId: approvedOvertime.id,
              },
            },
          );
        }
      }
    }

    console.log('No valid overtime found');
    console.log(approvedOvertime, pendingOvertimeRequest);

    // Fallback response for any unhandled cases
    return this.createResponse(
      false,
      `ไม่สามารถลงเวลาได้ใน${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}`,
      {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
        flags: {
          isOvertime: false,
          isDayOffOvertime: false,
        },
      },
    );
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

  private handleOvertimeAttendance(
    now: Date,
    overtimeStart: Date,
    overtimeEnd: Date,
    overtimeRequest: ApprovedOvertimeInfo,
    inPremises: boolean,
    address: string,
    latestAttendance: AttendanceRecord | null,
    p0: {
      id: string;
      employeeId: string;
      reason: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      leaveType: string;
      leaveFormat: string;
      startDate: Date;
      endDate: Date;
      fullDayCount: number;
      approverId: string | null;
      denierId: string | null;
      denialReason: string | null;
      resubmitted: boolean;
      originalRequestId: string | null;
    }[],
  ): CheckInOutAllowance {
    const EARLY_WINDOW = 30; // minutes
    const LATE_WINDOW = 15; // minutes

    const isCheckingIn = !latestAttendance?.regularCheckInTime;
    const earlyWindow = subMinutes(overtimeStart, EARLY_WINDOW);
    const lateWindow = addMinutes(overtimeEnd, LATE_WINDOW);

    // Handle missed check-in near period end
    const missedTime = differenceInMinutes(now, overtimeStart);
    if (!isCheckingIn && missedTime <= 60) {
      return this.createResponse(
        true,
        'ระบบจะทำการลงเวลาเข้า-ออกงานล่วงเวลาย้อนหลังให้',
        {
          inPremises,
          address,
          periodType: PeriodType.OVERTIME,
          requireConfirmation: true,

          flags: {
            isOvertime: true,
            isDayOffOvertime: overtimeRequest.isDayOffOvertime,
            isInsideShift: overtimeRequest.isInsideShiftHours,
            isAutoCheckIn: true,
            isAutoCheckOut: true,
          },
          timing: {
            actualStartTime: overtimeStart.toISOString(),
            actualEndTime: min([now, overtimeEnd]).toISOString(),
            missedCheckInTime: missedTime,
          },
          metadata: {
            overtimeId: overtimeRequest.id,
          },
        },
      );
    }

    // Normal overtime check-in/out
    if (isCheckingIn) {
      if (now < earlyWindow) {
        return this.createResponse(
          false,
          'คุณมาเร็วเกินไปสำหรับช่วงเวลาทำงานล่วงเวลา',
          {
            inPremises,
            address,
            periodType: PeriodType.OVERTIME,
          },
        );
      }

      return this.createResponse(
        true,
        'คุณกำลังลงเวลาทำงานล่วงเวลาที่ได้รับอนุมัติ',
        {
          inPremises,
          address,
          periodType: PeriodType.OVERTIME,
          flags: {
            isOvertime: true,
            isDayOffOvertime: overtimeRequest.isDayOffOvertime,
            isInsideShift: overtimeRequest.isInsideShiftHours,
          },
          timing: {
            actualStartTime:
              now >= overtimeStart
                ? now.toISOString()
                : overtimeStart.toISOString(),
            plannedStartTime: overtimeStart.toISOString(),
          },
          metadata: {
            overtimeId: overtimeRequest.id,
          },
        },
      );
    } else {
      return this.createResponse(true, 'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลา', {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
        flags: {
          isOvertime: true,
          isDayOffOvertime: overtimeRequest.isDayOffOvertime,
          isInsideShift: overtimeRequest.isInsideShiftHours,
        },
        timing: {
          actualStartTime: overtimeStart.toISOString(),
          actualEndTime: min([now, overtimeEnd]).toISOString(),
          plannedEndTime: overtimeEnd.toISOString(),
        },
        metadata: {
          overtimeId: overtimeRequest.id,
        },
      });
    }
  }

  private handleRegularShiftAttendance(
    now: Date,
    shiftData: any,
    inPremises: boolean,
    address: string,
    latestAttendance: AttendanceRecord | null,
    approvedOvertime: ApprovedOvertimeInfo | null,
    p0: {
      id: string;
      employeeId: string;
      updatedAt: Date;
      reason: string;
      status: string;
      createdAt: Date;
      leaveType: string;
      leaveFormat: string;
      startDate: Date;
      endDate: Date;
      fullDayCount: number;
      approverId: string | null;
      denierId: string | null;
      denialReason: string | null;
      resubmitted: boolean;
      originalRequestId: string | null;
    }[],
    effectiveShift: any,
  ): CheckInOutAllowance {
    if (!shiftData?.effectiveShift) {
      return this.createResponse(false, 'ไม่พบข้อมูลกะการทำงานของคุณ', {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
      });
    }

    if (approvedOvertime && this.isAtOvertimeStart(now, approvedOvertime)) {
      return this.handleApprovedOvertime(
        approvedOvertime,
        now,
        inPremises,
        address,
        !latestAttendance?.regularCheckInTime,
        latestAttendance,
      )!;
    }

    const shiftStart = this.shiftService.utils.parseShiftTime(
      effectiveShift.startTime,
      now,
    );
    const shiftEnd = this.shiftService.utils.parseShiftTime(
      effectiveShift.endTime,
      now,
    );

    const isCheckingIn = !latestAttendance?.regularCheckInTime;
    const EARLY_CHECK_IN_WINDOW = 30; // minutes
    const LATE_CHECK_IN_THRESHOLD = 5; // minutes

    if (isAfter(now, shiftEnd)) {
      return this.createResponse(
        false,
        'ไม่สามารถลงเวลาได้เนื่องจากเลยเวลาทำงานแล้ว',
        {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
          flags: {
            isLateCheckOut: true,
            isOutsideShift: true,
          },
        },
      );
    }

    if (isCheckingIn) {
      // Handle check-in
      const earlyWindow = subMinutes(shiftStart, EARLY_CHECK_IN_WINDOW);
      const lateThreshold = addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD);

      if (now < earlyWindow) {
        return this.createResponse(
          false,
          `คุณมาเร็วเกินไป กรุณารอถึงเวลาเข้างาน`,
          {
            inPremises,
            address,
            periodType: PeriodType.OVERTIME,
          },
        );
      }

      const isLate = now > lateThreshold;
      return this.createResponse(
        true,
        isLate ? 'คุณกำลังลงเวลาเข้างานสาย' : 'คุณกำลังลงเวลาเข้างาน',
        {
          inPremises,
          address,
          periodType: PeriodType.OVERTIME,
          flags: {
            isLateCheckIn: isLate,
          },
          timing: {
            plannedStartTime: shiftStart.toISOString(),
          },
        },
      );
    } else {
      // Redirect to handleCheckOut for consistent checkout logic
      return this.handleCheckOut(
        now,
        shiftEnd,
        shiftEnd,
        approvedOvertime,
        null,
        inPremises,
        address,
        [],
        effectiveShift,
        latestAttendance,
      );
    }
  }

  // Update handleApprovedOvertime to be more focused
  private handleApprovedOvertime(
    approvedOvertime: ApprovedOvertimeInfo,
    now: Date,
    inPremises: boolean,
    address: string,
    isCheckingIn: boolean,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance | null {
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
    );
    let overtimeEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
    );

    if (overtimeEnd < overtimeStart) {
      overtimeEnd = addDays(overtimeEnd, 1);
    }

    const { earlyCheckInWindow, lateCheckOutWindow } = this.getOvertimeWindows(
      overtimeStart,
      overtimeEnd,
    );

    // Handle late check-in with auto-complete
    if (!isCheckingIn) {
      const missedCheckIn = !latestAttendance?.regularCheckInTime;
      const isWithinLateWindow = now <= lateCheckOutWindow;

      if (missedCheckIn && isWithinLateWindow) {
        const missedTime = differenceInMinutes(now, overtimeStart);
        if (missedTime <= 60) {
          // Auto-complete window
          return this.createResponse(
            true,
            'ระบบจะทำการลงเวลาเข้า-ออกงานล่วงเวลาย้อนหลังให้',
            {
              inPremises,
              address,
              periodType: PeriodType.OVERTIME,
              requireConfirmation: true,
              flags: {
                isOvertime: true,
                isDayOffOvertime: approvedOvertime.isDayOffOvertime,
                isInsideShift: approvedOvertime.isInsideShiftHours,
                isAutoCheckIn: true,
                isAutoCheckOut: true,
              },
              timing: {
                missedCheckInTime: missedTime,
                actualStartTime: overtimeStart.toISOString(),
                actualEndTime: now.toISOString(),
              },
              metadata: {
                overtimeId: approvedOvertime.id,
              },
            },
          );
        }
      }
    }

    // Normal overtime flow
    if (isCheckingIn) {
      if (now >= earlyCheckInWindow && now <= overtimeEnd) {
        return this.createResponse(
          true,
          'คุณกำลังลงเวลาทำงานล่วงเวลาที่ได้รับอนุมัติ',
          {
            inPremises,
            address,
            periodType: PeriodType.OVERTIME,
            flags: {
              isOvertime: true,
              isDayOffOvertime: approvedOvertime.isDayOffOvertime,
              isInsideShift: approvedOvertime.isInsideShiftHours,
            },
            timing: {
              actualStartTime:
                now >= overtimeStart
                  ? now.toISOString()
                  : overtimeStart.toISOString(),
              plannedStartTime: overtimeStart.toISOString(),
            },
            metadata: {
              overtimeId: approvedOvertime.id,
            },
          },
        );
      }
    } else if (now <= lateCheckOutWindow) {
      return this.createResponse(true, 'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลา', {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
        flags: {
          isOvertime: true,
          isDayOffOvertime: approvedOvertime.isDayOffOvertime,
          isInsideShift: approvedOvertime.isInsideShiftHours,
        },
        timing: {
          actualEndTime: now.toISOString(),
          plannedEndTime: overtimeEnd.toISOString(),
        },
        metadata: {
          overtimeId: approvedOvertime.id,
        },
      });
    }
    return null; // Not in overtime period
  }

  private handleCheckOut(
    now: Date,
    earlyCheckOutWindow: Date,
    shiftEnd: Date,
    approvedOvertime: ApprovedOvertimeInfo | null,
    pendingOvertime: any,
    inPremises: boolean,
    address: string,
    leaveRequests: LeaveRequest[],
    effectiveShift: ShiftData,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    // 1. First check if already checked out
    if (latestAttendance?.regularCheckOutTime) {
      // Handle overtime transition case
      if (approvedOvertime && this.isAtOvertimeStart(now, approvedOvertime)) {
        return this.handleApprovedOvertime(
          approvedOvertime,
          now,
          inPremises,
          address,
          true,
          latestAttendance,
        )!;
      }
      return this.createResponse(false, 'คุณได้ลงเวลาออกงานแล้ว', {
        inPremises,
        address,
      });
    }

    // 2. Check if within active overtime period
    if (approvedOvertime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
      );

      if (isWithinInterval(now, { start: overtimeStart, end: overtimeEnd })) {
        return this.handleOvertimeCheckout(
          now,
          overtimeStart,
          overtimeEnd,
          approvedOvertime,
          inPremises,
          address,
          latestAttendance,
        );
      }

      // Handle transition to overtime if at start
      const overtimeResponse = this.handleApprovedOvertime(
        approvedOvertime,
        now,
        inPremises,
        address,
        false,
        latestAttendance,
      );
      if (overtimeResponse) return overtimeResponse;
    }

    // 3. Regular shift checkout handling
    return this.handleRegularShiftCheckout(
      now,
      shiftEnd,
      inPremises,
      address,
      leaveRequests,
      effectiveShift,
      latestAttendance,
    );
  }

  // New method to handle overtime-specific checkout
  private handleOvertimeCheckout(
    now: Date,
    overtimeStart: Date,
    overtimeEnd: Date,
    overtime: ApprovedOvertimeInfo,
    inPremises: boolean,
    address: string,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    console.log('HandleApprovedOvertime:', {
      now: now.toISOString(),
      overtimeStart: overtime.startTime,
      overtimeEnd: overtime.endTime,
      earlyWindow: ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
    });
    // Early checkout during overtime just records actual time
    const minutesEarly = Math.abs(differenceInMinutes(now, overtimeEnd));
    const isEarlyCheckout = now < overtimeEnd;

    return this.createResponse(
      true,
      isEarlyCheckout
        ? 'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลาก่อนเวลาที่อนุมัติ'
        : 'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลา',
      {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
        flags: {
          isOvertime: true,
          isDayOffOvertime: overtime.isDayOffOvertime,
          isInsideShift: overtime.isInsideShiftHours,
          isEarlyCheckOut: isEarlyCheckout,
        },
        timing: {
          actualStartTime: latestAttendance?.regularCheckInTime?.toISOString(),
          actualEndTime: now.toISOString(),
          plannedStartTime: overtimeStart.toISOString(),
          plannedEndTime: overtimeEnd.toISOString(),
          minutesEarly: isEarlyCheckout ? minutesEarly : 0,
          checkoutStatus: isEarlyCheckout ? 'early' : 'normal',
        },
        metadata: {
          overtimeId: overtime.id,
        },
      },
    );
  }

  // New method to handle regular shift checkout
  private handleRegularShiftCheckout(
    now: Date,
    shiftEnd: Date,
    inPremises: boolean,
    address: string,
    leaveRequests: LeaveRequest[],
    effectiveShift: ShiftData,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    const shiftStart = this.shiftService.utils.parseShiftTime(
      effectiveShift.startTime,
      now,
    );
    const shiftMidpoint = new Date(
      (shiftStart.getTime() + shiftEnd.getTime()) / 2,
    );

    const { earlyCheckoutStart, regularCheckoutEnd } =
      this.getCheckoutWindow(shiftEnd);
    const isEarlyCheckout = this.isEarlyCheckout(now, shiftEnd);
    const minutesEarly = isEarlyCheckout
      ? Math.abs(differenceInMinutes(now, shiftEnd))
      : 0;
    const checkoutStatus = this.getCheckoutStatus(now, shiftEnd);

    // Handle very early checkout (requires leave request)
    if (checkoutStatus === 'very_early') {
      if (now < shiftMidpoint) {
        return this.createResponse(
          true,
          'คุณกำลังจะลงเวลาออกก่อนเวลาเที่ยง ระบบจะทำการยื่นคำขอลาป่วยเต็มวันให้อัตโนมัติ',
          {
            inPremises,
            address,
            periodType: PeriodType.REGULAR,
            requireConfirmation: true,
            flags: {
              isEarlyCheckOut: true,
              isEmergencyLeave: true,
            },
            timing: {
              minutesEarly,
              checkoutStatus: 'very_early',
            },
          },
        );
      } else {
        return this.createResponse(
          false,
          'ไม่สามารถลงเวลาออกก่อนเวลาเลิกงานได้ กรุณาติดต่อฝ่ายบุคคล',
          {
            inPremises,
            address,
            periodType: PeriodType.REGULAR,
            flags: {
              isEarlyCheckOut: true,
              isAfterMidshift: true,
            },
            timing: {
              checkoutStatus: 'very_early',
              minutesEarly,
            },
          },
        );
      }
    }

    // Handle half-day leave
    const leaveContext = this.determineHalfDayLeaveContext(
      leaveRequests,
      latestAttendance,
      now,
      shiftMidpoint,
    );

    if (leaveContext.hasHalfDayLeave) {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาออกงานสำหรับช่วงเช้า (ลาครึ่งวันช่วงบ่าย)',
        {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
          flags: {
            isPlannedHalfDayLeave: true,
            isMorningShift: true,
            isApprovedEarlyCheckout: true,
          },
          timing: {
            checkoutStatus,
          },
        },
      );
    }

    // Handle normal checkout windows
    switch (checkoutStatus) {
      case 'normal':
        return this.createResponse(true, 'คุณกำลังลงเวลาออกงาน', {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
          timing: {
            checkoutStatus: 'normal',
          },
        });
      case 'late':
        return this.createResponse(true, 'คุณกำลังลงเวลาออกงานช้า', {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
          flags: {
            isLateCheckOut: true,
          },
          timing: {
            checkoutStatus: 'late',
          },
        });
      default:
        return this.createResponse(true, 'คุณกำลังลงเวลาออกงาน', {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
          flags: {
            isEarlyCheckOut: true,
          },
          timing: {
            checkoutStatus: 'early',
            minutesEarly,
          },
        });
    }
  }
  private isAtOvertimeStart(
    now: Date,
    approvedOvertime: ApprovedOvertimeInfo,
  ): boolean {
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
    );
    return isWithinInterval(now, {
      start: subMinutes(
        overtimeStart,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      ),
      end: addMinutes(
        overtimeStart,
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
      ),
    });
  }

  private getCheckoutWindow(shiftEnd: Date) {
    const earlyCheckoutStart = subMinutes(
      shiftEnd,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
    );
    const regularCheckoutEnd = addMinutes(
      shiftEnd,
      ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
    );
    return { earlyCheckoutStart, regularCheckoutEnd };
  }

  private isEarlyCheckout(now: Date, shiftEnd: Date): boolean {
    const { earlyCheckoutStart } = this.getCheckoutWindow(shiftEnd);
    return isBefore(now, earlyCheckoutStart);
  }

  private getCheckoutStatus(now: Date, shiftEnd: Date): CheckoutStatusType {
    const { earlyCheckoutStart, regularCheckoutEnd } =
      this.getCheckoutWindow(shiftEnd);

    if (isBefore(now, subMinutes(earlyCheckoutStart, 60))) {
      return 'very_early';
    }
    if (isBefore(now, earlyCheckoutStart)) {
      return 'early';
    }
    if (isAfter(now, regularCheckoutEnd)) {
      return 'late';
    }
    return 'normal';
  }

  private getOvertimeWindows(overtimeStart: Date, overtimeEnd: Date) {
    const earlyCheckInWindow = subMinutes(
      overtimeStart,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
    );
    const lateCheckOutWindow = addMinutes(
      overtimeEnd,
      ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
    );
    return { earlyCheckInWindow, lateCheckOutWindow };
  }
}

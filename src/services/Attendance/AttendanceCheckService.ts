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
  Period,
} from '../../types/attendance';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../../lib/serverCache';
import { cacheService } from '../CacheService';
import {
  addMinutes,
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  parseISO,
  startOfDay,
  subMinutes,
} from 'date-fns';
import { getCurrentTime } from '../../utils/dateUtils';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { PeriodManagementService } from './PeriodManagementService';
import { AutoCompletionService } from './AutoCompletionService';

export class AttendanceCheckService {
  private periodManager: PeriodManagementService;
  private readonly autoCompleter: AutoCompletionService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly overtimeService: OvertimeServiceServer,
    private readonly leaveService: LeaveServiceServer,
    private readonly holidayService: HolidayService,
    private processingService: AttendanceProcessingService,
  ) {
    this.periodManager = new PeriodManagementService();
    this.autoCompleter = new AutoCompletionService();
  }

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

      // Build periods array
      const periods: Period[] = [];

      periods.push({
        type: PeriodType.REGULAR,
        startTime: this.shiftService.utils.parseShiftTime(
          shiftData.effectiveShift.startTime,
          now,
        ),
        endTime: this.shiftService.utils.parseShiftTime(
          shiftData.effectiveShift.endTime,
          now,
        ),
        isOvertime: false,
        isOvernight:
          shiftData.effectiveShift.endTime < shiftData.effectiveShift.startTime,
      });

      if (approvedOvertime) {
        periods.push({
          type: PeriodType.OVERTIME,
          startTime: parseISO(
            `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
          ),
          endTime: parseISO(
            `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
          ),
          isOvertime: true,
          overtimeId: approvedOvertime.id,
          isOvernight: approvedOvertime.endTime < approvedOvertime.startTime,
        });
      }

      // Determine current period
      const currentPeriod = this.periodManager.determineCurrentPeriod(
        now,
        periods,
      );

      // Basic validations remain the same...
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

      // Handle different cases using current period
      const { isHoliday, isDayOff } = shiftData.shiftstatus;

      if (isHoliday || isDayOff) {
        return this.handleNonWorkingDayAttendance(
          isHoliday ? 'holiday' : 'dayoff',
          approvedOvertime,
          inPremises,
          address,
          now,
          latestAttendance,
          pendingOvertime,
        );
      }

      // Add missed period detection
      if (!latestAttendance?.CheckOutTime) {
        const now = getCurrentTime();
        const shiftEnd = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${shiftData.effectiveShift.endTime}`,
        );

        // If we're past shift end and have approved overtime
        if (now > shiftEnd && approvedOvertime) {
          // Check if we're also past overtime
          const overtimeEnd = parseISO(
            `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
          );

          if (now > overtimeEnd) {
            // Trigger auto-completion
            return this.createResponse(
              true,
              'ระบบจะทำการลงเวลาออกงานปกติและลงเวลาเข้า-ออกงานล่วงเวลาให้อัตโนมัติ',
              {
                inPremises,
                address,
                periodType: PeriodType.REGULAR,
                requireConfirmation: true,
                flags: {
                  isAutoCheckIn: true,
                  isAutoCheckOut: true,
                  isOvertime: true,
                },
                timing: {
                  missedCheckOutTime: differenceInMinutes(now, shiftEnd),
                  plannedEndTime: shiftEnd.toISOString(),
                  overtimeMissed: true,
                },
              },
            );
          }
        }
      }
      if (currentPeriod?.type === PeriodType.OVERTIME) {
        if (!approvedOvertime) {
          return this.createResponse(
            false,
            'ไม่พบข้อมูลการทำงานล่วงเวลาที่ได้รับอนุมัติ',
            {
              inPremises,
              address,
              periodType: PeriodType.OVERTIME,
              flags: {
                isOvertime: true,
              },
            },
          );
        }

        return this.handleApprovedOvertime(
          approvedOvertime,
          now,
          inPremises,
          address,
          !latestAttendance?.CheckInTime,
          latestAttendance,
        );
      }

      return this.handleRegularShiftAttendance(
        now,
        shiftData,
        inPremises,
        address,
        latestAttendance,
        approvedOvertime,
        leaveRequest ? [leaveRequest] : [],
        shiftData.effectiveShift,
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
    if (!approvedOvertime && !pendingOvertimeRequest) {
      return this.createResponse(
        false,
        `${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}: การลงเวลาจะต้องได้รับการอนุมัติ`,
        {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
        },
      );
    }

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

    if (approvedOvertime) {
      const overtimePeriod: Period = {
        type: PeriodType.OVERTIME,
        startTime: parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
        ),
        endTime: parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
        ),
        isOvertime: true,
        overtimeId: approvedOvertime.id,
        isOvernight: approvedOvertime.endTime < approvedOvertime.startTime,
        isDayOffOvertime: true,
      };

      const currentPeriod = this.periodManager.determineCurrentPeriod(now, [
        overtimePeriod,
      ]);
      const isCheckingIn = !latestAttendance?.CheckInTime;

      if (currentPeriod) {
        // Check for missing entries
        const autoCompletionStrategy = this.autoCompleter.handleMissingEntries(
          latestAttendance,
          now,
        );

        if (autoCompletionStrategy.requiresConfirmation) {
          return this.createResponse(true, autoCompletionStrategy.message, {
            inPremises,
            address,
            periodType: PeriodType.OVERTIME,
            requireConfirmation: true,
            flags: {
              isOvertime: true,
              isDayOffOvertime: true,
              isAutoCheckIn: !latestAttendance?.CheckInTime,
              isAutoCheckOut: !latestAttendance?.CheckOutTime,
            },
            metadata: {
              overtimeId: approvedOvertime.id,
            },
          });
        }

        if (isCheckingIn) {
          const isLateCheckIn =
            now >
            addMinutes(
              overtimePeriod.startTime,
              ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
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
                isEarlyCheckIn: now < overtimePeriod.startTime,
              },
              timing: {
                actualStartTime: now.toISOString(),
                plannedStartTime: overtimePeriod.startTime.toISOString(),
              },
              metadata: {
                overtimeId: approvedOvertime.id,
              },
            },
          );
        } else {
          const isEarlyCheckOut = now < overtimePeriod.endTime;
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
                plannedEndTime: overtimePeriod.endTime.toISOString(),
                checkoutStatus: this.getCheckoutStatus(
                  now,
                  overtimePeriod.endTime,
                ),
              },
              metadata: {
                overtimeId: approvedOvertime.id,
              },
            },
          );
        }
      }
    }

    return this.createResponse(
      false,
      `ไม่สามารถลงเวลาได้ใน${type === 'holiday' ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}`,
      {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
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

    const checkInTime = latestAttendance?.CheckInTime
      ? new Date(latestAttendance.CheckInTime)
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

  private handleRegularShiftAttendance(
    now: Date,
    shiftData: any,
    inPremises: boolean,
    address: string,
    latestAttendance: AttendanceRecord | null,
    approvedOvertime: ApprovedOvertimeInfo | null,
    leaveRequests: LeaveRequest[],
    effectiveShift: ShiftData,
  ): CheckInOutAllowance {
    if (!effectiveShift) {
      return this.createResponse(false, 'ไม่พบข้อมูลกะการทำงานของคุณ', {
        inPremises,
        address,
        periodType: PeriodType.REGULAR,
      });
    }

    // Convert to period
    const regularPeriod: Period = {
      type: PeriodType.REGULAR,
      startTime: this.shiftService.utils.parseShiftTime(
        effectiveShift.startTime,
        now,
      ),
      endTime: this.shiftService.utils.parseShiftTime(
        effectiveShift.endTime,
        now,
      ),
      isOvertime: false,
      isOvernight: effectiveShift.endTime < effectiveShift.startTime,
    };

    const currentPeriod = this.periodManager.determineCurrentPeriod(now, [
      regularPeriod,
    ]);
    const isCheckingIn = !latestAttendance?.CheckInTime;

    // Check for missing entries that need auto-completion
    const autoCompletionStrategy = this.autoCompleter.handleMissingEntries(
      latestAttendance,
      now,
    );

    if (autoCompletionStrategy.requiresConfirmation) {
      return this.createResponse(true, autoCompletionStrategy.message, {
        inPremises,
        address,
        periodType: PeriodType.REGULAR,
        requireConfirmation: true,
        flags: {
          isAutoCheckIn: isCheckingIn,
          isAutoCheckOut: !isCheckingIn,
        },
        timing: {
          missedCheckInTime: isCheckingIn
            ? undefined
            : differenceInMinutes(now, regularPeriod.startTime),
        },
      });
    }

    // Handle check-in
    if (isCheckingIn) {
      // ... existing check-in logic ...
    }

    // Handle early checkout for regular shift
    const earlyCheckoutStart = subMinutes(
      regularPeriod.endTime,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
    );
    const isEarlyCheckout = now < earlyCheckoutStart;

    if (isEarlyCheckout && !leaveRequests.length) {
      // Block early checkout if no approved leave
      return this.createResponse(false, 'ไม่สามารถลงเวลาออกก่อนเวลาที่กำหนด', {
        inPremises,
        address,
        periodType: PeriodType.REGULAR,
        flags: {
          isEarlyCheckOut: true,
          isOutsideShift: true,
          isOvertime: false,
        },
        timing: {
          minutesEarly: differenceInMinutes(regularPeriod.endTime, now),
          plannedEndTime: regularPeriod.endTime.toISOString(),
          checkoutStatus: 'early',
        },
      });
    }

    // Only proceed to handleCheckOut if not early checkout
    return this.handleCheckOut(
      now,
      regularPeriod.endTime,
      regularPeriod.endTime,
      approvedOvertime,
      null,
      inPremises,
      address,
      leaveRequests,
      effectiveShift,
      latestAttendance,
    );
  }

  // Update handleApprovedOvertime to be more focused
  private handleApprovedOvertime(
    approvedOvertime: ApprovedOvertimeInfo,
    now: Date,
    inPremises: boolean,
    address: string,
    isCheckingIn: boolean,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    // Create overtime period
    const period: Period = {
      type: PeriodType.OVERTIME,
      startTime: parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
      ),
      endTime: parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
      ),
      isOvertime: true,
      overtimeId: approvedOvertime.id,
      isOvernight: approvedOvertime.endTime < approvedOvertime.startTime,
    };

    const currentPeriod = this.periodManager.determineCurrentPeriod(now, [
      period,
    ]);

    if (!currentPeriod) {
      // Instead of returning null, return a response indicating not allowed
      return this.createResponse(false, 'ไม่อยู่ในช่วงเวลาทำงานล่วงเวลา', {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
        flags: {
          isOvertime: false,
        },
      });
    }

    // Handle auto-completion case
    if (!isCheckingIn && !latestAttendance?.CheckInTime) {
      const missedTime = differenceInMinutes(now, currentPeriod.startTime);
      if (missedTime <= 60) {
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
              actualStartTime: currentPeriod.startTime.toISOString(),
              actualEndTime: now.toISOString(),
            },
            metadata: {
              overtimeId: approvedOvertime.id,
            },
          },
        );
      }
    }

    // Normal overtime flow
    return this.createResponse(
      true,
      isCheckingIn
        ? 'คุณกำลังลงเวลาทำงานล่วงเวลาที่ได้รับอนุมัติ'
        : 'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลา',
      {
        inPremises,
        address,
        periodType: PeriodType.OVERTIME,
        flags: {
          isOvertime: true,
          isDayOffOvertime: approvedOvertime.isDayOffOvertime,
          isInsideShift: approvedOvertime.isInsideShiftHours,
          isEarlyCheckIn: isCheckingIn && now < period.startTime,
          isLateCheckOut: !isCheckingIn && now > period.endTime,
        },
        timing: {
          actualStartTime: isCheckingIn ? now.toISOString() : undefined,
          actualEndTime: !isCheckingIn ? now.toISOString() : undefined,
          plannedStartTime: period.startTime.toISOString(),
          plannedEndTime: period.endTime.toISOString(),
        },
        metadata: {
          overtimeId: approvedOvertime.id,
        },
      },
    );
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
    if (latestAttendance?.CheckOutTime) {
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

    // 2. Check overtime transition
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

    // 3. Early checkout validation - Add this block
    const earlyCheckoutStart = subMinutes(
      shiftEnd,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
    );
    const isEarlyCheckout = now < earlyCheckoutStart;

    if (isEarlyCheckout && !leaveRequests.length) {
      return this.createResponse(false, 'ไม่สามารถลงเวลาออกก่อนเวลาที่กำหนด', {
        inPremises,
        address,
        periodType: PeriodType.REGULAR,
        flags: {
          isEarlyCheckOut: true,
          isOutsideShift: true,
        },
        timing: {
          minutesEarly: differenceInMinutes(shiftEnd, now),
          plannedEndTime: shiftEnd.toISOString(),
          checkoutStatus: 'early',
        },
      });
    }

    // 4. Regular checkout - Only if not early
    const isLateCheckOut = isAfter(now, shiftEnd);

    return this.createResponse(
      true,
      isLateCheckOut ? 'คุณกำลังลงเวลาออกงานล่าช้า' : 'คุณกำลังลงเวลาออกงาน',
      {
        inPremises,
        address,
        periodType: PeriodType.REGULAR,
        flags: {
          isLateCheckOut,
          isOutsideShift: isLateCheckOut,
          isEarlyCheckOut: isEarlyCheckout,
        },
        timing: {
          plannedEndTime: shiftEnd.toISOString(),
          checkoutStatus: isLateCheckOut ? 'late' : 'normal',
        },
      },
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
          actualStartTime: latestAttendance?.CheckInTime?.toISOString(),
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

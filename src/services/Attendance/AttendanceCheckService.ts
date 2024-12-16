// AttendanceCheckService.ts - Check-in/out validation

import { LeaveRequest, PrismaClient, User } from '@prisma/client';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { HolidayService } from '../HolidayService';
import {
  AttendanceRecord,
  CheckInOutAllowance,
  ShiftData,
  ApprovedOvertimeInfo,
  AppError,
  ErrorCode,
  CheckoutStatusType,
  PeriodType,
  CACHE_CONSTANTS,
  ATTENDANCE_CONSTANTS,
  Period,
  EnhancedAttendanceStatus,
  ShiftStatus,
} from '../../types/attendance';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../../lib/serverCache';
import { cacheService } from '../CacheService';
import {
  addHours,
  addMinutes,
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  isWithinInterval,
  parseISO,
  startOfDay,
  subHours,
  subMinutes,
} from 'date-fns';
import { getCurrentTime } from '../../utils/dateUtils';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { PeriodManagementService } from './PeriodManagementService';
import { AutoCompletionService } from './AutoCompletionService';
import { AttendanceEnhancementService } from './AttendanceEnhancementService';

interface ValidationContext {
  now: Date;
  inPremises: boolean;
  address: string;
  currentPeriod: Period;
  latestAttendance: AttendanceRecord | null;
  approvedOvertime: ApprovedOvertimeInfo | null;
  enhancedStatus: EnhancedAttendanceStatus;
  shiftData?: {
    effectiveShift: ShiftData;
    shiftstatus: ShiftStatus;
  };
  leaveRequests?: LeaveRequest[];
}

export class AttendanceCheckService {
  private readonly periodManager: PeriodManagementService;
  private readonly enhancementService: AttendanceEnhancementService;

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
    this.enhancementService = new AttendanceEnhancementService();
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

  private createPeriod(
    type: PeriodType,
    startTime: string | Date,
    endTime: string | Date,
    now: Date,
    options?: {
      isOvertime?: boolean;
      overtimeId?: string;
      isDayOffOvertime?: boolean;
    },
  ): Period {
    const start =
      typeof startTime === 'string'
        ? parseISO(`${format(now, 'yyyy-MM-dd')}T${startTime}`)
        : startTime;
    const end =
      typeof endTime === 'string'
        ? parseISO(`${format(now, 'yyyy-MM-dd')}T${endTime}`)
        : endTime;

    return {
      type,
      startTime: start,
      endTime: end,
      isOvertime: options?.isOvertime ?? false,
      overtimeId: options?.overtimeId,
      isOvernight: format(end, 'HH:mm') < format(start, 'HH:mm'),
      isDayOffOvertime: options?.isDayOffOvertime,
    };
  }

  private async validateAttendanceContext(
    context: ValidationContext,
  ): Promise<CheckInOutAllowance | null> {
    // 1. Handle missing entries first
    if (context.enhancedStatus.missingEntries.length > 0) {
      return this.handleAutoCompletion(context);
    }

    const {
      latestAttendance,
      currentPeriod,
      approvedOvertime,
      shiftData,
      now,
    } = context;

    // 2. Check for period transitions
    if (shiftData?.effectiveShift) {
      const regularStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${shiftData.effectiveShift.startTime}`,
      );
      const regularEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${shiftData.effectiveShift.endTime}`,
      );

      // Function to check if times connect
      const doPeriodsConnect = (
        period1End: Date,
        period2Start: Date,
      ): boolean => {
        return format(period1End, 'HH:mm') === format(period2Start, 'HH:mm');
      };

      // Handle overtime to regular transition
      if (
        currentPeriod.type === PeriodType.OVERTIME &&
        latestAttendance?.CheckInTime &&
        !latestAttendance.CheckOutTime &&
        doPeriodsConnect(currentPeriod.endTime, regularStart)
      ) {
        return this.handlePeriodTransition(
          context,
          {
            start: currentPeriod.startTime,
            end: currentPeriod.endTime,
            type: PeriodType.OVERTIME,
          },
          {
            start: regularStart,
            end: regularEnd,
            type: PeriodType.REGULAR,
          },
        );
      }

      // Handle regular to overtime transition
      if (
        currentPeriod.type === PeriodType.REGULAR &&
        latestAttendance?.CheckInTime &&
        !latestAttendance.CheckOutTime &&
        approvedOvertime &&
        doPeriodsConnect(
          regularEnd,
          parseISO(
            `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
          ),
        )
      ) {
        return this.handlePeriodTransition(
          context,
          {
            start: regularStart,
            end: regularEnd,
            type: PeriodType.REGULAR,
          },
          {
            start: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
            ),
            end: parseISO(
              `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
            ),
            type: PeriodType.OVERTIME,
          },
        );
      }
    }

    // 3. Handle immediate overtime after regular check-out
    if (
      currentPeriod.type === PeriodType.REGULAR &&
      latestAttendance?.CheckOutTime &&
      approvedOvertime
    ) {
      const periodAvailability =
        await this.determinePeriodAvailability(context);
      if (periodAvailability.canTransitionToOvertime) {
        if (periodAvailability.transitionType === 'immediate') {
          return this.handleImmediateOvertimeTransition(
            context,
            periodAvailability.overtimeWindow!,
          );
        }
        return this.handleOvertimeTransition(context);
      }
    }

    // 4. Handle other transitions from enhancedStatus
    if (context.enhancedStatus.pendingTransitions.length > 0) {
      const transition = context.enhancedStatus.pendingTransitions[0];
      if (
        await this.isEligibleForTransition(context, {
          from: transition.from,
          to: transition.to,
          transitionTime: transition.transitionTime,
          isCompleted: false, // Add the missing property 'isCompleted' with a value of 'false'
        })
      ) {
        // Get current period info
        const fromPeriod = {
          start: currentPeriod.startTime,
          end: currentPeriod.endTime,
          type: currentPeriod.type,
        };

        // Get target period info based on transition
        const toPeriod = {
          start: transition.transitionTime,
          end:
            transition.to === PeriodType.OVERTIME && approvedOvertime
              ? parseISO(
                  `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
                )
              : shiftData?.effectiveShift
                ? parseISO(
                    `${format(now, 'yyyy-MM-dd')}T${shiftData.effectiveShift.endTime}`,
                  )
                : addHours(transition.transitionTime, 9), // fallback 9-hour shift
          type: transition.to, // Changed from transition.type to transition.to
        };

        return this.handlePeriodTransition(context, fromPeriod, toPeriod);
      }
    }

    // 5. Handle non-working days
    if (
      context.shiftData?.shiftstatus.isHoliday ||
      context.shiftData?.shiftstatus.isDayOff
    ) {
      return this.handleNonWorkingDay(context);
    }

    // 6. Regular period validation
    const isCheckingIn = !latestAttendance?.CheckInTime;
    if (currentPeriod.type === PeriodType.OVERTIME) {
      return this.handleOvertimeAttendance({
        ...context,
        isCheckingIn,
      });
    }

    return this.handleRegularAttendance({
      ...context,
      isCheckingIn,
    });
  }

  private async isEligibleForTransition(
    context: ValidationContext,
    transition: {
      from: PeriodType;
      to: PeriodType;
      transitionTime: Date;
      isCompleted: boolean;
    },
  ): Promise<boolean> {
    // Add Promise<boolean> here
    const { latestAttendance, approvedOvertime, now } = context;

    // Don't process if immediate overtime is possible
    const periodAvailability = await this.determinePeriodAvailability(context);
    if (periodAvailability.transitionType === 'immediate') {
      return false;
    }

    // Regular transition checks
    if (
      transition.from === PeriodType.REGULAR &&
      !latestAttendance?.CheckOutTime
    ) {
      return false;
    }

    if (transition.to === PeriodType.OVERTIME && !approvedOvertime) {
      return false;
    }

    return isWithinInterval(now, {
      start: subMinutes(transition.transitionTime, 30),
      end: addMinutes(transition.transitionTime, 30),
    });
  }

  private async determinePeriodAvailability(
    context: ValidationContext,
  ): Promise<{
    canTransitionToOvertime: boolean;
    overtimeWindow?: { start: Date; end: Date };
    currentPeriodType: PeriodType;
    transitionType?: 'immediate' | 'regular' | null;
  }> {
    const { now, latestAttendance, approvedOvertime, shiftData } = context;

    if (!approvedOvertime) {
      return {
        canTransitionToOvertime: false,
        currentPeriodType: PeriodType.REGULAR,
      };
    }

    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
    );
    const overtimeEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
    );

    // Check if within early overtime window
    const earlyOvertimeWindow = subMinutes(
      overtimeStart,
      ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
    );

    if (!latestAttendance || !latestAttendance.CheckInTime) {
      if (
        isWithinInterval(now, {
          start: earlyOvertimeWindow,
          end: overtimeEnd,
        })
      ) {
        return {
          canTransitionToOvertime: true,
          overtimeWindow: { start: overtimeStart, end: overtimeEnd },
          currentPeriodType: PeriodType.OVERTIME,
          transitionType: 'immediate',
        };
      }
    }

    // Rest of existing immediate transition logic
    if (latestAttendance?.CheckOutTime) {
      const checkOutTime = new Date(latestAttendance.CheckOutTime);
      const timeSinceCheckout = differenceInMinutes(now, checkOutTime);

      if (
        timeSinceCheckout <= 5 &&
        isWithinInterval(now, {
          start: subMinutes(overtimeStart, 15),
          end: addMinutes(overtimeStart, 30),
        })
      ) {
        return {
          canTransitionToOvertime: true,
          overtimeWindow: { start: overtimeStart, end: overtimeEnd },
          currentPeriodType: PeriodType.OVERTIME,
          transitionType: 'immediate',
        };
      }
    }

    // Regular overtime window check remains unchanged
    if (
      isWithinInterval(now, {
        start: subMinutes(overtimeStart, 30),
        end: addMinutes(overtimeEnd, 30),
      })
    ) {
      return {
        canTransitionToOvertime: true,
        overtimeWindow: { start: overtimeStart, end: overtimeEnd },
        currentPeriodType: PeriodType.OVERTIME,
        transitionType: 'regular',
      };
    }

    return {
      canTransitionToOvertime: false,
      currentPeriodType: PeriodType.REGULAR,
      transitionType: null,
    };
  }

  private handleOvertimeTransition(
    context: ValidationContext,
  ): CheckInOutAllowance {
    const { inPremises, address, approvedOvertime } = context;

    return this.createResponse(true, 'กรุณายืนยันการเริ่มทำงานล่วงเวลา', {
      inPremises,
      address,
      periodType: PeriodType.OVERTIME,
      requireConfirmation: true,
      flags: {
        isOvertime: true,
        isDayOffOvertime: approvedOvertime?.isDayOffOvertime || false,
        isInsideShift: approvedOvertime?.isInsideShiftHours || false,
        isAutoCheckOut: false,
        isAutoCheckIn: true,
      },
      timing: {
        plannedStartTime: format(
          parseISO(
            `${format(context.now, 'yyyy-MM-dd')}T${approvedOvertime?.startTime}`,
          ),
          'HH:mm',
        ),
        plannedEndTime: format(
          parseISO(
            `${format(context.now, 'yyyy-MM-dd')}T${approvedOvertime?.endTime}`,
          ),
          'HH:mm',
        ),
      },
      metadata: {
        overtimeId: approvedOvertime?.id,
        nextPeriod: {
          type: PeriodType.OVERTIME,
          startTime: approvedOvertime?.startTime || '',
          overtimeId: approvedOvertime?.id,
        },
      },
    });
  }

  private async handleAutoCompletion(
    context: ValidationContext,
  ): Promise<CheckInOutAllowance> {
    const { enhancedStatus, approvedOvertime, inPremises, address } = context;

    // Sort missing entries chronologically
    const sortedMissingEntries = [...enhancedStatus.missingEntries].sort(
      (a, b) => a.expectedTime.getTime() - b.expectedTime.getTime(),
    );

    // Get overtime context if relevant
    const hasMissedOvertime = sortedMissingEntries.some(
      (entry) => entry.periodType === PeriodType.OVERTIME,
    );

    // Prepare metadata about missing entries
    const missedEntries = sortedMissingEntries.map((entry) => ({
      type: entry.type,
      periodType: entry.periodType,
      expectedTime: entry.expectedTime.toISOString(),
      overtimeId: entry.overtimeId,
    }));

    return this.createResponse(true, 'ระบบจะทำการลงเวลาย้อนหลังให้อัตโนมัติ', {
      inPremises,
      address,
      periodType: context.currentPeriod.type,
      requireConfirmation: true,
      flags: {
        isAutoCheckIn: sortedMissingEntries.some((e) => e.type === 'check-in'),
        isAutoCheckOut: sortedMissingEntries.some(
          (e) => e.type === 'check-out',
        ),
        isOvertime: hasMissedOvertime,
        isDayOffOvertime: approvedOvertime?.isDayOffOvertime || false,
        isInsideShift: approvedOvertime?.isInsideShiftHours || false,
      },
      timing: {
        missedEntries,
        overtimeMissed: hasMissedOvertime,
      },
      metadata: {
        overtimeId: approvedOvertime?.id,
      },
    });
  }

  private handleImmediateOvertimeTransition(
    context: ValidationContext,
    overtimeWindow: { start: Date; end: Date },
  ): CheckInOutAllowance {
    const { inPremises, address, approvedOvertime } = context;

    return this.createResponse(true, 'กรุณายืนยันการเข้าทำงานล่วงเวลาทันที', {
      inPremises,
      address,
      periodType: PeriodType.OVERTIME,
      requireConfirmation: true,
      flags: {
        isOvertime: true,
        isDayOffOvertime: approvedOvertime?.isDayOffOvertime || false,
        isInsideShift: approvedOvertime?.isInsideShiftHours || false,
        isAutoCheckIn: true,
      },
      timing: {
        plannedStartTime: format(overtimeWindow.start, 'HH:mm'),
        plannedEndTime: format(overtimeWindow.end, 'HH:mm'),
        transitionTime: new Date().toISOString(),
      },
      metadata: {
        overtimeId: approvedOvertime?.id,
        nextPeriod: {
          type: PeriodType.OVERTIME,
          startTime: format(overtimeWindow.start, 'HH:mm'),
          overtimeId: approvedOvertime?.id,
        },
      },
    });
  }

  private handlePeriodTransition(
    context: ValidationContext,
    fromPeriod: { start: Date; end: Date; type: PeriodType },
    toPeriod: { start: Date; end: Date; type: PeriodType },
  ): CheckInOutAllowance {
    const { now, inPremises, address, latestAttendance } = context;

    // Add check for overtime transition case
    if (
      fromPeriod.type === PeriodType.REGULAR &&
      toPeriod.type === PeriodType.OVERTIME
    ) {
      // If already checked in but not checked out, handle the transition
      if (latestAttendance?.CheckInTime && !latestAttendance.CheckOutTime) {
        return this.createResponse(
          true,
          'กรุณายืนยันการลงเวลาออกงานปกติและเข้าทำงานล่วงเวลา',
          {
            inPremises,
            address,
            periodType: fromPeriod.type,
            requireConfirmation: true,
            flags: {
              isOvertime: true,
              isAutoCheckOut: true,
              hasPendingTransition: true,
              requiresOvertimeCheckIn: true,
            },
            timing: {
              transitionWindow: {
                start: fromPeriod.end.toISOString(),
                end: toPeriod.start.toISOString(),
                fromPeriod: fromPeriod.type,
                toPeriod: toPeriod.type,
              },
            },
            metadata: {
              overtimeId: context.approvedOvertime?.id,
            },
          },
        );
      }
    }

    // Keep existing transition window logic
    const transitionWindow = {
      start: subMinutes(toPeriod.start, 15),
      end: addMinutes(toPeriod.start, 15),
      fromPeriod: fromPeriod.type,
      toPeriod: toPeriod.type,
    };

    const isInTransitionWindow = isWithinInterval(now, {
      start: transitionWindow.start,
      end: transitionWindow.end,
    });

    if (!isInTransitionWindow) {
      const formattedStart = format(transitionWindow.start, 'HH:mm');
      const formattedEnd = format(transitionWindow.end, 'HH:mm');

      return this.createResponse(
        false,
        `การเปลี่ยนกะต้องทำในช่วงเวลา ${formattedStart}-${formattedEnd} น.`,
        {
          inPremises,
          address,
          periodType: fromPeriod.type,
          requireConfirmation: true,
          flags: {
            isOvertime:
              fromPeriod.type === PeriodType.OVERTIME ||
              toPeriod.type === PeriodType.OVERTIME,
          },
          timing: {
            transitionWindow: {
              start: transitionWindow.start.toISOString(),
              end: transitionWindow.end.toISOString(),
              fromPeriod: fromPeriod.type,
              toPeriod: toPeriod.type,
            },
          },
        },
      );
    }

    // Create appropriate message based on transition type
    const transitionMessage = this.getTransitionMessage(
      fromPeriod.type,
      toPeriod.type,
    );

    return this.createResponse(true, transitionMessage, {
      inPremises,
      address,
      periodType: fromPeriod.type,
      requireConfirmation: true,
      flags: {
        isOvertime:
          fromPeriod.type === PeriodType.OVERTIME ||
          toPeriod.type === PeriodType.OVERTIME,
        isAutoCheckOut: true,
        isAutoCheckIn: true,
      },
      timing: {
        transitionWindow: {
          start: transitionWindow.start.toISOString(),
          end: transitionWindow.end.toISOString(),
          fromPeriod: fromPeriod.type,
          toPeriod: toPeriod.type,
        },
        plannedEndTime: fromPeriod.end.toISOString(),
        plannedStartTime: toPeriod.start.toISOString(),
      },
    });
  }

  private getTransitionMessage(
    fromType: PeriodType,
    toType: PeriodType,
  ): string {
    if (fromType === PeriodType.REGULAR && toType === PeriodType.OVERTIME) {
      return 'กรุณายืนยันการลงเวลาออกกะปกติและเข้าทำงานล่วงเวลา';
    }
    if (fromType === PeriodType.OVERTIME && toType === PeriodType.REGULAR) {
      return 'กรุณายืนยันการลงเวลาออก OT และเข้ากะปกติ';
    }
    return 'กรุณายืนยันการเปลี่ยนกะ';
  }

  private handleNonWorkingDay(context: ValidationContext): CheckInOutAllowance {
    const {
      approvedOvertime,
      shiftData,
      inPremises,
      address,
      latestAttendance,
    } = context;

    const type = shiftData?.shiftstatus.isHoliday ? 'holiday' : 'dayoff';

    if (!approvedOvertime) {
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

    const isCheckingIn = !latestAttendance?.CheckInTime;
    const overtimePeriod = this.createPeriod(
      PeriodType.OVERTIME,
      approvedOvertime.startTime,
      approvedOvertime.endTime,
      context.now,
      {
        isOvertime: true,
        overtimeId: approvedOvertime.id,
        isDayOffOvertime: true,
      },
    );

    return this.handleOvertimeAttendance({
      ...context,
      currentPeriod: overtimePeriod,
      isCheckingIn,
    });
  }

  private handleOvertimeAttendance(
    context: ValidationContext & { isCheckingIn: boolean },
  ): CheckInOutAllowance {
    const {
      now,
      currentPeriod,
      approvedOvertime,
      inPremises,
      address,
      isCheckingIn,
    } = context;

    if (isCheckingIn) {
      const overtimeStart = currentPeriod.startTime;
      const earlyCheckInWindow = subMinutes(
        overtimeStart,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      );

      // Check if attempting to check in too early
      if (isBefore(now, earlyCheckInWindow)) {
        return this.createResponse(
          false,
          `ไม่สามารถลงเวลาเข้างานได้ก่อนเวลา ${format(earlyCheckInWindow, 'HH:mm')} น.`,
          {
            inPremises,
            address,
            periodType: PeriodType.OVERTIME,
            flags: {
              isOvertime: true,
              isDayOffOvertime: approvedOvertime?.isDayOffOvertime || false,
              isInsideShift: approvedOvertime?.isInsideShiftHours || false,
              isEarlyCheckIn: true,
            },
            timing: {
              actualStartTime: now.toISOString(),
              plannedStartTime: overtimeStart.toISOString(),
              earliestAllowedTime: earlyCheckInWindow.toISOString(),
            },
          },
        );
      }

      const isLateCheckIn = isAfter(
        now,
        addMinutes(overtimeStart, ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD),
      );

      return this.createResponse(
        true,
        'คุณกำลังลงเวลาทำงานล่วงเวลาที่ได้รับอนุมัติ',
        {
          inPremises,
          address,
          periodType: PeriodType.OVERTIME,
          flags: {
            isOvertime: true,
            isDayOffOvertime: approvedOvertime?.isDayOffOvertime || false,
            isInsideShift: approvedOvertime?.isInsideShiftHours || false,
            isLateCheckIn,
            isEarlyCheckIn: isBefore(now, overtimeStart),
          },
          timing: {
            actualStartTime: now.toISOString(),
            plannedStartTime: overtimeStart.toISOString(),
          },
          metadata: {
            overtimeId: currentPeriod.overtimeId,
          },
        },
      );
    }

    // Rest of the existing check-out logic remains the same
    const isEarlyCheckOut = isBefore(now, currentPeriod.endTime);
    return this.createResponse(true, 'คุณกำลังลงเวลาออกจากการทำงานล่วงเวลา', {
      inPremises,
      address,
      periodType: PeriodType.OVERTIME,
      flags: {
        isOvertime: true,
        isDayOffOvertime: approvedOvertime?.isDayOffOvertime || false,
        isInsideShift: approvedOvertime?.isInsideShiftHours || false,
        isEarlyCheckOut,
      },
      timing: {
        actualEndTime: now.toISOString(),
        plannedEndTime: currentPeriod.endTime.toISOString(),
        checkoutStatus: this.getCheckoutStatus(now, currentPeriod.endTime),
      },
      metadata: {
        overtimeId: currentPeriod.overtimeId,
      },
    });
  }

  private handleRegularAttendance(
    context: ValidationContext & { isCheckingIn: boolean },
  ): CheckInOutAllowance {
    const {
      now,
      currentPeriod,
      shiftData,
      leaveRequests,
      inPremises,
      address,
      isCheckingIn,
    } = context;

    if (isCheckingIn) {
      return this.handleRegularCheckIn(context);
    }

    const isEarlyCheckout = this.isEarlyCheckout(now, currentPeriod.endTime);

    if (isEarlyCheckout && (!leaveRequests || leaveRequests.length === 0)) {
      return this.handleEarlyCheckout(context);
    }

    return this.handleRegularCheckout(context);
  }

  private handleRegularCheckIn(
    context: ValidationContext & { isCheckingIn: boolean },
  ): CheckInOutAllowance {
    const { now, currentPeriod, inPremises, address } = context;

    // Calculate minutes before shift start
    const minutesBeforeShift = differenceInMinutes(
      currentPeriod.startTime,
      now,
    );

    // Check if attempting to check in too early
    if (minutesBeforeShift > ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD) {
      const earliestCheckInTime = subMinutes(
        currentPeriod.startTime,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      );

      return this.createResponse(
        false,
        `ไม่สามารถลงเวลาเข้างานได้ก่อนเวลา ${format(earliestCheckInTime, 'HH:mm')} น.`,
        {
          inPremises,
          address,
          periodType: PeriodType.REGULAR,
          flags: {
            isEarlyCheckIn: true,
            isInsideShift: false,
          },
          timing: {
            actualStartTime: now.toISOString(),
            plannedStartTime: currentPeriod.startTime.toISOString(),
            minutesEarly: minutesBeforeShift,
            earliestAllowedTime: earliestCheckInTime.toISOString(),
          },
        },
      );
    }

    // Calculate if check-in is late
    const isLateCheckIn =
      differenceInMinutes(now, currentPeriod.startTime) >
      ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD;

    return this.createResponse(
      true,
      isLateCheckIn ? 'คุณกำลังลงเวลาเข้างานสาย' : 'คุณกำลังลงเวลาเข้างาน',
      {
        inPremises,
        address,
        periodType: PeriodType.REGULAR,
        flags: {
          isLateCheckIn,
          isEarlyCheckIn: false,
          isInsideShift: true,
        },
        timing: {
          actualStartTime: now.toISOString(),
          plannedStartTime: currentPeriod.startTime.toISOString(),
        },
      },
    );
  }

  private handleEarlyCheckout(context: ValidationContext): CheckInOutAllowance {
    const { now, currentPeriod, inPremises, address } = context;

    const minutesEarly = differenceInMinutes(currentPeriod.endTime, now);
    const checkoutStatus = this.getCheckoutStatus(now, currentPeriod.endTime);

    if (checkoutStatus === 'very_early') {
      return this.handleVeryEarlyCheckout(context);
    }

    return this.createResponse(false, 'ไม่สามารถลงเวลาออกก่อนเวลาที่กำหนด', {
      inPremises,
      address,
      periodType: PeriodType.REGULAR,
      flags: {
        isEarlyCheckOut: true,
        isOutsideShift: true,
      },
      timing: {
        minutesEarly,
        plannedEndTime: currentPeriod.endTime.toISOString(),
        checkoutStatus: 'early',
      },
    });
  }

  private handleVeryEarlyCheckout(
    context: ValidationContext,
  ): CheckInOutAllowance {
    const { now, currentPeriod, inPremises, address } = context;
    const shiftMidpoint = this.calculateShiftMidpoint(currentPeriod);
    const shiftEnd = currentPeriod.endTime;

    // Check if current time is before the testing end time
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
            checkoutStatus: 'very_early',
          },
        },
      );
    }

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
        },
      },
    );
  }

  private handleRegularCheckout(
    context: ValidationContext,
  ): CheckInOutAllowance {
    const { now, currentPeriod, inPremises, address, leaveRequests } = context;

    const isLateCheckOut =
      now >
      addMinutes(
        currentPeriod.endTime,
        ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
      );

    // Handle half-day leave case
    if (leaveRequests?.some((leave) => leave.leaveFormat === 'ลาครึ่งวัน')) {
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
          },
          timing: {
            checkoutStatus: 'normal',
          },
        },
      );
    }

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
        },
        timing: {
          actualEndTime: now.toISOString(),
          plannedEndTime: currentPeriod.endTime.toISOString(),
          checkoutStatus: isLateCheckOut ? 'late' : 'normal',
        },
      },
    );
  }

  // Utility methods
  private calculateShiftMidpoint(period: Period): Date {
    return new Date(
      (period.startTime.getTime() + period.endTime.getTime()) / 2,
    );
  }

  private getCheckoutWindow(shiftEnd: Date) {
    return {
      earlyCheckoutStart: subMinutes(
        shiftEnd,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_OUT_THRESHOLD,
      ),
      regularCheckoutEnd: addMinutes(
        shiftEnd,
        ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
      ),
    };
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

  public async isCheckInOutAllowed(
    employeeId: string,
    inPremises: boolean,
    address: string,
  ): Promise<CheckInOutAllowance> {
    const user = await this.getCachedUserData(employeeId);
    if (!user)
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });

    const now = getCurrentTime();
    const today = startOfDay(now);

    try {
      // Keep your existing data fetching
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

      // Check for overtime period first
      if (approvedOvertime) {
        const overtimeStart = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
        );
        const overtimeEnd = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
        );
        const earlyWindow = subMinutes(
          overtimeStart,
          ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
        );

        if (
          isWithinInterval(now, {
            start: earlyWindow,
            end: overtimeEnd,
          })
        ) {
          const overtimePeriod = {
            type: PeriodType.OVERTIME,
            startTime: overtimeStart,
            endTime: overtimeEnd,
            isOvertime: true,
            overtimeId: approvedOvertime.id,
            isOvernight: false,
          };

          const enhancedStatus =
            await this.enhancementService.enhanceAttendanceStatus(
              latestAttendance,
              overtimePeriod,
              approvedOvertime,
            );

          return this.handleOvertimeAttendance({
            now,
            inPremises,
            address,
            currentPeriod: overtimePeriod,
            latestAttendance,
            approvedOvertime,
            enhancedStatus,
            shiftData: {
              effectiveShift: shiftData.effectiveShift,
              shiftstatus: shiftData.shiftstatus,
            },
            isCheckingIn: !latestAttendance?.CheckInTime,
          });
        }
      }

      // Create current period using your existing logic
      const currentPeriod = this.createPeriod(
        PeriodType.REGULAR,
        shiftData.effectiveShift.startTime,
        shiftData.effectiveShift.endTime,
        now,
      );

      // Get enhanced status
      const enhancedStatus =
        await this.enhancementService.enhanceAttendanceStatus(
          latestAttendance,
          currentPeriod,
          approvedOvertime,
        );

      // Create validation context
      const context: ValidationContext = {
        now,
        inPremises,
        address,
        currentPeriod,
        latestAttendance,
        approvedOvertime,
        enhancedStatus,
        shiftData: {
          effectiveShift: shiftData.effectiveShift,
          shiftstatus: shiftData.shiftstatus,
        },
        leaveRequests: leaveRequest ? [leaveRequest] : [],
      };

      // Handle basic validations first
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

      // Handle basic validations first
      if (leaveRequest) {
        return this.createResponse(
          false,
          'คุณได้รับอนุมัติให้ลางานสำหรับวันนี้',
          {
            inPremises,
            address,
            periodType: PeriodType.REGULAR,
          },
        );
      }

      // Check for enhanced validations
      const enhancedValidation = await this.validateAttendanceContext(context);
      if (enhancedValidation) {
        return enhancedValidation;
      }

      // Continue with normal flow
      const isCheckingIn = !latestAttendance?.CheckInTime;
      return isCheckingIn
        ? this.handleRegularAttendance({ ...context, isCheckingIn: true })
        : this.handleRegularAttendance({ ...context, isCheckingIn: false });
    } catch (error) {
      // Your existing error handling
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
}

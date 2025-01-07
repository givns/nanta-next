//TimeEntryService
import {
  PrismaClient,
  Prisma,
  TimeEntry,
  LeaveRequest,
  PeriodType,
  TimeEntryStatus,
  AttendanceState,
  CheckStatus,
  OvertimeState,
} from '@prisma/client';
import {
  addDays,
  addHours,
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  max,
  min,
} from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { NotificationService } from './NotificationService';
import { cacheService } from './cache/CacheService';
import {
  ApprovedOvertimeInfo,
  StatusUpdateResult,
  ProcessingOptions,
  AttendanceRecord,
} from '../types/attendance';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { LeaveServiceServer } from './LeaveServiceServer';
import { th } from 'date-fns/locale';
import { getCurrentTime } from '@/utils/dateUtils';

interface CheckInCalculationsResult {
  minutesLate: number;
  isHalfDayLate: boolean;
}

interface WorkingHoursResult {
  regularHours: number;
  overtimeHours: number;
  overtimeMetadata: OvertimeMetadataInput | null;
}

interface OvertimeMetadataInput {
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
}

interface EntryMetricsResult {
  minutesLate: number;
  isHalfDayLate: boolean;
  regularHours: number;
  overtimeHours: number;
  overtimeMetadata: any | null;
}

export class TimeEntryService {
  // Constants
  private readonly REGULAR_HOURS_PER_SHIFT = 8;
  private readonly OVERTIME_INCREMENT = 30;
  private readonly LATE_THRESHOLD = 30;
  private readonly HALF_DAY_THRESHOLD = 240;
  private readonly OVERTIME_MINIMUM_MINUTES = 30;
  private readonly OVERTIME_ROUND_TO_MINUTES = 30;
  private readonly BREAK_DURATION_MINUTES = 60;
  private readonly BREAK_START_OFFSET = 4;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private prisma: PrismaClient,
    private notificationService: NotificationService,
    private overtimeService: OvertimeServiceServer,
    private leaveService: LeaveServiceServer,
    private shiftService: ShiftManagementService,
  ) {}

  async processTimeEntries(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    statusUpdate: StatusUpdateResult,
    options: ProcessingOptions,
  ): Promise<{
    regular?: TimeEntry;
    overtime?: TimeEntry[];
  }> {
    try {
      // Pre-fetch all necessary data
      const [overtimeRequest, leaveRequests, shift] = await Promise.all([
        this.overtimeService.getCurrentApprovedOvertimeRequest(
          options.employeeId,
          new Date(options.checkTime),
        ),
        this.leaveService.getLeaveRequests(options.employeeId),
        this.shiftService.getEffectiveShiftAndStatus(
          attendance.employeeId,
          attendance.date,
        ),
      ]);

      // Process entries within transaction
      const result = await this.processEntriesWithContext(
        tx,
        attendance,
        options,
        {
          overtimeRequest,
          leaveRequests,
          shift,
        },
      );

      // Handle post-processing asynchronously
      setImmediate(() => {
        this.handlePostProcessing(
          attendance,
          options,
          result,
          shift,
          leaveRequests,
        ).catch((error) =>
          console.error('Post-processing error:', {
            error,
            employeeId: attendance.employeeId,
            timestamp: getCurrentTime(),
          }),
        );
      });

      return result;
    } catch (error) {
      console.error('Error processing time entries:', error);
      throw error;
    }
  }

  private async processEntriesWithContext(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    options: ProcessingOptions,
    context: {
      overtimeRequest: ApprovedOvertimeInfo | null;
      leaveRequests: LeaveRequest[];
      shift: any;
    },
  ) {
    const { overtimeRequest, leaveRequests } = context;

    // Handle auto-completion case
    if (
      options.activity.requireConfirmation &&
      options.activity.overtimeMissed
    ) {
      // First handle regular checkout
      const regularEntry = await this.handleRegularEntry(
        tx,
        attendance,
        false, // isCheckIn = false for checkout
        leaveRequests,
        context.shift,
      );

      // Then handle overtime entries if there's overtime
      if (overtimeRequest) {
        const overtimeCheckin = await this.handleOvertimeEntry(
          tx,
          attendance,
          overtimeRequest,
          true, // isCheckIn = true
        );

        const overtimeCheckout = await this.handleOvertimeEntry(
          tx,
          attendance,
          overtimeRequest,
          false, // isCheckIn = false
        );

        return {
          regular: regularEntry,
          overtime: [overtimeCheckin, overtimeCheckout],
        };
      }

      return { regular: regularEntry };
    }

    // Existing logic for normal cases
    console.log('Processing entries with context:', {
      periodType: options.periodType,
      isOvertime: options.activity.isOvertime,
      checkTime: options.checkTime,
    });

    // Verify period type matches activity
    if (options.periodType === PeriodType.OVERTIME) {
      // Force overtime true if period type is overtime
      options.activity.isOvertime = true;

      const overtimeEntry = await this.handleOvertimeEntry(
        tx,
        attendance,
        context.overtimeRequest!,
        options.activity.isCheckIn,
      );

      console.log('Created overtime entry:', {
        id: overtimeEntry.id,
        startTime: overtimeEntry.startTime,
        endTime: overtimeEntry.endTime,
        overtimeHours: overtimeEntry.overtimeHours,
      });

      return { overtime: [overtimeEntry] };
    }

    const regularEntry = await this.handleRegularEntry(
      tx,
      attendance,
      options.activity.isCheckIn,
      leaveRequests,
      context.shift,
    );
    return { regular: regularEntry };
  }

  private async handleRegularEntry(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    isCheckIn: boolean,
    leaveRequests: LeaveRequest[],
    shift: any,
  ): Promise<TimeEntry> {
    const shiftTimes = this.getShiftTimes(shift, attendance.date);
    const metrics = this.calculateEntryMetrics(
      attendance,
      isCheckIn,
      shiftTimes,
      leaveRequests,
    );

    const existingEntry = await tx.timeEntry.findFirst({
      where: {
        attendanceId: attendance.id,
        entryType: PeriodType.REGULAR,
      },
    });

    const entryData = this.prepareRegularEntryData(
      attendance,
      metrics,
      isCheckIn,
    );

    if (existingEntry) {
      return tx.timeEntry.update({
        where: { id: existingEntry.id },
        data: entryData,
      });
    }

    return tx.timeEntry.create({
      data: {
        ...entryData,
        user: { connect: { employeeId: attendance.employeeId } },
        attendance: { connect: { id: attendance.id } },
      },
    });
  }

  private async handlePostProcessing(
    attendance: AttendanceRecord,
    options: ProcessingOptions,
    result: { regular?: TimeEntry; overtime?: TimeEntry[] },
    shift: any,
    leaveRequests: LeaveRequest[],
  ) {
    try {
      if (
        options.activity.isCheckIn &&
        !options.activity.isOvertime &&
        result.regular
      ) {
        if (shift?.effectiveShift) {
          const shiftStart = this.parseShiftTime(
            shift.effectiveShift.startTime,
            attendance.date,
          );

          const { minutesLate, isHalfDayLate } = this.calculateLateStatus(
            attendance.CheckInTime!,
            shiftStart,
          );

          if (minutesLate > this.LATE_THRESHOLD && !leaveRequests.length) {
            await this.notifyLateCheckIn(
              attendance.employeeId,
              attendance.CheckInTime!,
              minutesLate,
              isHalfDayLate,
            );
          }
        }
      }
    } catch (error) {
      console.error('Post-processing error:', {
        error,
        employeeId: attendance.employeeId,
        timestamp: getCurrentTime(),
      });
    }
  }

  private prepareOvertimeData(
    attendance: AttendanceRecord,
    overtimeRequest: ApprovedOvertimeInfo,
    isCheckIn: boolean,
  ) {
    const baseData = {
      date: attendance.date,
      regularHours: 0,
      entryType: PeriodType.OVERTIME,
      overtimeMetadata: {
        isDayOffOvertime: overtimeRequest.isDayOffOvertime,
        isInsideShiftHours: overtimeRequest.isInsideShiftHours,
      },
    };

    if (isCheckIn) {
      return {
        ...baseData,
        startTime: attendance.CheckInTime!,
        endTime: null,
        overtimeHours: 0,
        status: TimeEntryStatus.STARTED,
      };
    }

    // For checkout
    const overtimeHours = this.calculateOvertimeHours(
      attendance.CheckInTime!,
      attendance.CheckOutTime!,
      overtimeRequest,
      null,
      null,
    ).hours;

    return {
      ...baseData,
      startTime: attendance.CheckInTime!,
      endTime: attendance.CheckOutTime!,
      overtimeHours,
      status: TimeEntryStatus.COMPLETED,
    };
  }

  private async handleOvertimeEntry(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    overtimeRequest: ApprovedOvertimeInfo,
    isCheckIn: boolean,
    periodType = PeriodType,
  ): Promise<TimeEntry> {
    console.log('Handle overtime entry:', {
      isCheckIn,
      attendanceId: attendance.id,
      checkInTime: attendance.CheckInTime,
      checkOutTime: attendance.CheckOutTime,
      overtimeId: overtimeRequest.id,
    });

    const existingEntry = await tx.timeEntry.findFirst({
      where: {
        // Match by overtime request ID if available
        overtimeRequestId: overtimeRequest.id,

        entryType: PeriodType.OVERTIME,

        // Add employee ID for extra specificity
        employeeId: attendance.employeeId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: { overtimeMetadata: true },
    });

    console.log('Attendance ID:', attendance.id);
    console.log('Existing Entry Query:', {
      attendanceId: attendance.id,
      entryType: PeriodType.OVERTIME,
    });

    // Add more comprehensive logging
    const allOvertimeEntries = await tx.timeEntry.findMany({
      where: {
        entryType: PeriodType.OVERTIME,
      },
      select: {
        id: true,
        attendanceId: true,
        employeeId: true,
        startTime: true,
        endTime: true,
        entryType: true,
      },
    });

    console.log(
      'All Overtime Entries:',
      JSON.stringify(allOvertimeEntries, null, 2),
    );

    // Check specific entry details
    const specificEntry = allOvertimeEntries.find(
      (entry) => entry.attendanceId === attendance.id,
    );

    console.log(
      'Specific Overtime Entry for this Attendance:',
      JSON.stringify(specificEntry, null, 2),
    );

    // Handle checkout
    if (!isCheckIn) {
      if (!existingEntry) {
        throw new Error('No existing overtime entry found for checkout');
      }

      const overtimeData = this.prepareOvertimeData(
        attendance,
        overtimeRequest,
        isCheckIn,
      );
      return await this.updateOvertimeEntry(tx, existingEntry.id, overtimeData);
    }

    // Handle check-in
    if (existingEntry) {
      throw new Error('Overtime entry already exists for this attendance');
    }

    const overtimeData = this.prepareOvertimeData(
      attendance,
      overtimeRequest,
      isCheckIn,
    );
    return this.createOvertimeEntry(
      tx,
      attendance,
      overtimeRequest,
      overtimeData,
    );
  }

  private getShiftTimes(shift: any, date: Date) {
    return {
      start: shift?.effectiveShift
        ? this.parseShiftTime(shift.effectiveShift.startTime, date)
        : null,
      end: shift?.effectiveShift
        ? this.parseShiftTime(shift.effectiveShift.endTime, date)
        : null,
    };
  }

  private calculateEntryMetrics(
    attendance: AttendanceRecord,
    isCheckIn: boolean,
    shiftTimes: { start: Date | null; end: Date | null },
    leaveRequests: LeaveRequest[],
  ): EntryMetricsResult {
    // Calculate late status if it's a check-in and shift start time exists
    const lateStatus =
      shiftTimes.start && isCheckIn
        ? this.calculateLateStatus(attendance.CheckInTime!, shiftTimes.start)
        : { minutesLate: 0, isHalfDayLate: false };

    // Calculate working hours for check-out if all required times exist
    const workingHours =
      !isCheckIn && shiftTimes.start && shiftTimes.end
        ? this.calculateWorkingHours(
            attendance.CheckInTime!,
            attendance.CheckOutTime,
            shiftTimes.start,
            shiftTimes.end,
            null,
            leaveRequests,
          )
        : { regularHours: 0, overtimeHours: 0, overtimeMetadata: null };

    // Log metrics calculation
    console.log('Entry metrics calculated:', {
      employeeId: attendance.employeeId,
      isCheckIn,
      lateStatus,
      workingHours,
      timestamp: getCurrentTime(),
    });

    return {
      ...lateStatus,
      ...workingHours,
    };
  }

  private prepareRegularEntryData(
    attendance: AttendanceRecord,
    metrics: any,
    isCheckIn: boolean,
  ) {
    return {
      date: attendance.date,
      startTime: attendance.CheckInTime || attendance.date,
      endTime: attendance.CheckOutTime || null,
      regularHours: metrics.regularHours,
      overtimeHours: 0,
      actualMinutesLate: metrics.minutesLate,
      isHalfDayLate: metrics.isHalfDayLate,
      status: isCheckIn ? TimeEntryStatus.STARTED : TimeEntryStatus.COMPLETED,
      entryType: PeriodType.REGULAR,
    };
  }

  // Cache-related methods
  async getTimeEntriesForEmployee(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TimeEntry[]> {
    const cacheKey = `timeEntries:${employeeId}:${format(startDate, 'yyyy-MM-dd')}:${format(endDate, 'yyyy-MM-dd')}`;

    if (cacheService) {
      const cachedEntries = await cacheService.get(cacheKey);
      if (cachedEntries) return JSON.parse(cachedEntries);
    }

    const entries = await this.prisma.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        overtimeMetadata: true,
      },
    });

    if (cacheService) {
      await cacheService.set(cacheKey, JSON.stringify(entries), this.CACHE_TTL);
    }

    return entries;
  }

  async getTimeEntriesForPayroll(
    startDate: Date,
    endDate: Date,
  ): Promise<TimeEntry[]> {
    return this.prisma.timeEntry.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: TimeEntryStatus.COMPLETED,
      },
      include: {
        user: true,
        overtimeMetadata: true,
      },
    });
  }

  // Simplified late status calculation (no notifications)
  private calculateLateStatus(
    checkInTime: Date,
    shiftStart: Date,
  ): CheckInCalculationsResult {
    const minutesLate = Math.max(
      0,
      differenceInMinutes(checkInTime, shiftStart),
    );
    const isHalfDayLate = minutesLate >= this.HALF_DAY_THRESHOLD;
    return { minutesLate, isHalfDayLate };
  }

  private async notifyLateCheckIn(
    employeeId: string,
    checkInTime: Date,
    minutesLate: number,
    isHalfDayLate: boolean,
  ): Promise<void> {
    console.log('Preparing admin notification for late check-in:', {
      employeeId,
      minutesLate,
      isHalfDayLate,
    });

    // Get employee details
    const employee = await this.prisma.user.findUnique({
      where: { employeeId },
      select: {
        name: true,
        department: {
          select: { name: true },
        },
      },
    });

    if (!employee) {
      console.error(`Employee not found for late notification: ${employeeId}`);
      return;
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['Admin', 'SuperAdmin'] },
      },
      select: { employeeId: true, lineUserId: true },
    });

    const formattedDate = format(checkInTime, 'dd MMMM yyyy', { locale: th });
    const formattedTime = format(checkInTime, 'HH:mm');

    for (const admin of admins) {
      if (admin.lineUserId) {
        try {
          const message = {
            type: 'text',
            text: [
              '🔔 แจ้งเตือนการมาสาย',
              `พนักงาน: ${employee.name}`,
              `วันที่: ${formattedDate}`,
              `เวลาเข้างาน: ${formattedTime} น.`,
              `สาย: ${Math.floor(minutesLate)} นาที`,
              isHalfDayLate ? '⚠️ สายเกิน 4 ชั่วโมง' : '',
            ]
              .filter(Boolean)
              .join('\n'),
          };

          await this.notificationService.sendNotification(
            admin.employeeId,
            admin.lineUserId,
            JSON.stringify(message),
            'check-in',
          );
          console.log(
            `Late check-in notification sent to admin ${admin.employeeId}`,
            {
              employeeId,
              adminId: admin.employeeId,
              timestamp: getCurrentTime(),
            },
          );
        } catch (error) {
          console.error(
            `Failed to send late check-in notification to admin ${admin.employeeId}:`,
            error,
          );
        }
      }
    }
  }

  public calculateWorkingHours(
    checkInTime: Date,
    checkOutTime: Date | null,
    shiftStart: Date,
    shiftEnd: Date,
    overtimeRequest: ApprovedOvertimeInfo | null,
    leaveRequests: LeaveRequest[],
  ): WorkingHoursResult {
    if (!checkOutTime) {
      return { regularHours: 0, overtimeHours: 0, overtimeMetadata: null };
    }

    // Check for leaves
    const hasFullDayLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'approved' &&
        leave.leaveFormat === 'ลาเต็มวัน' &&
        isSameDay(new Date(leave.startDate), checkInTime),
    );

    const hasHalfDayLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(new Date(leave.startDate), checkInTime),
    );

    if (hasFullDayLeave) {
      return {
        regularHours: this.REGULAR_HOURS_PER_SHIFT,
        overtimeHours: 0,
        overtimeMetadata: null,
      };
    }

    if (hasHalfDayLeave) {
      return {
        regularHours: this.REGULAR_HOURS_PER_SHIFT / 2,
        overtimeHours: 0,
        overtimeMetadata: null,
      };
    }

    // For regular attendance, calculate based on actual time within shift bounds
    const effectiveStart = max([checkInTime, shiftStart]);
    const effectiveEnd = min([checkOutTime, shiftEnd]);

    const breakStart = addHours(shiftStart, this.BREAK_START_OFFSET);
    const breakEnd = addMinutes(breakStart, this.BREAK_DURATION_MINUTES);

    const effectiveMinutes = this.calculateEffectiveMinutes(
      effectiveStart,
      effectiveEnd,
      breakStart,
      breakEnd,
    );

    return {
      regularHours: Math.min(
        effectiveMinutes / 60,
        this.REGULAR_HOURS_PER_SHIFT,
      ),
      overtimeHours: 0,
      overtimeMetadata: null,
    };
  }

  private calculateEffectiveMinutes(
    startTime: Date,
    endTime: Date,
    breakStart: Date,
    breakEnd: Date,
  ): number {
    if (endTime <= breakStart || startTime >= breakEnd) {
      return differenceInMinutes(endTime, startTime);
    }

    if (startTime <= breakStart && endTime >= breakEnd) {
      return (
        differenceInMinutes(endTime, startTime) - this.BREAK_DURATION_MINUTES
      );
    }

    if (startTime < breakEnd && endTime > breakStart) {
      const overlapStart = max([startTime, breakStart]);
      const overlapEnd = min([endTime, breakEnd]);
      const breakOverlap = differenceInMinutes(overlapEnd, overlapStart);
      return differenceInMinutes(endTime, startTime) - breakOverlap;
    }

    return differenceInMinutes(endTime, startTime);
  }

  private calculateOvertimeHours(
    checkInTime: Date,
    checkOutTime: Date,
    overtimeRequest: ApprovedOvertimeInfo,
    breakStart: Date | null,
    breakEnd: Date | null,
  ): { hours: number; metadata: OvertimeMetadataInput | null } {
    const overtimeStart = this.parseShiftTime(
      overtimeRequest.startTime,
      overtimeRequest.date,
    );
    let overtimeEnd = this.parseShiftTime(
      overtimeRequest.endTime,
      overtimeRequest.date,
    );

    // Handle overnight overtime
    if (overtimeEnd < overtimeStart) {
      overtimeEnd = addDays(overtimeEnd, 1);
    }

    // Ensure checkout is within overtime period
    const effectiveStart = max([checkInTime, overtimeStart]);
    const effectiveEnd = min([checkOutTime, overtimeEnd]);

    // Calculate minutes worked
    const overtimeMinutes =
      breakStart && breakEnd
        ? this.calculateEffectiveMinutes(
            effectiveStart,
            effectiveEnd,
            breakStart,
            breakEnd,
          )
        : differenceInMinutes(effectiveEnd, effectiveStart);

    // Special handling: if less than minimum threshold, return 0
    if (overtimeMinutes < this.OVERTIME_MINIMUM_MINUTES) {
      return {
        hours: 0,
        metadata: null,
      };
    }

    // Calculate based on planned overtime duration
    const plannedOvertimeMinutes = overtimeRequest.durationMinutes;
    const workedPercentage = (overtimeMinutes / plannedOvertimeMinutes) * 100;

    // Must complete at least 90% of planned overtime to get full hours
    if (workedPercentage < 90) {
      // Round down to nearest 30 minutes
      const roundedMinutes =
        Math.floor(overtimeMinutes / this.OVERTIME_INCREMENT) *
        this.OVERTIME_INCREMENT;
      return {
        hours: roundedMinutes / 60,
        metadata: {
          isDayOffOvertime: overtimeRequest.isDayOffOvertime,
          isInsideShiftHours: overtimeRequest.isInsideShiftHours,
        },
      };
    }

    // If completed 90% or more, give full overtime hours
    return {
      hours: plannedOvertimeMinutes / 60,
      metadata: {
        isDayOffOvertime: overtimeRequest.isDayOffOvertime,
        isInsideShiftHours: overtimeRequest.isInsideShiftHours,
      },
    };
  }

  public calculateOvertimeDuration(
    attendance: AttendanceRecord,
    approvedOvertime: ApprovedOvertimeInfo,
    currentTime: Date,
  ): number {
    if (!attendance.CheckInTime) return 0;

    const result = this.calculateOvertimeHours(
      attendance.CheckInTime,
      attendance.CheckOutTime || currentTime,
      approvedOvertime,
      null,
      null,
    );

    return result.hours;
  }

  private parseShiftTime(timeString: string, date: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hours,
      minutes,
      0,
      0,
    );
  }

  private async updateOvertimeEntry(
    tx: Prisma.TransactionClient,
    id: string,
    data: any,
  ): Promise<TimeEntry> {
    console.log('Updating overtime entry:', {
      id,
      endTime: data.endTime,
      overtimeHours: data.overtimeHours,
    });

    return tx.timeEntry.update({
      where: { id },
      data: {
        endTime: data.endTime,
        overtimeHours: data.overtimeHours,
        status: data.status,
        regularHours: 0,
        overtimeMetadata: {
          update: data.overtimeMetadata,
        },
      },
      include: { overtimeMetadata: true },
    });
  }

  private async createOvertimeEntry(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    overtimeRequest: ApprovedOvertimeInfo,
    data: any,
  ): Promise<TimeEntry> {
    return tx.timeEntry.create({
      data: {
        ...data,
        user: { connect: { employeeId: attendance.employeeId } },
        attendance: { connect: { id: attendance.id } },
        overtimeRequest: { connect: { id: overtimeRequest.id } },
        overtimeMetadata: { create: data.overtimeMetadata },
      },
      include: { overtimeMetadata: true },
    });
  }
}

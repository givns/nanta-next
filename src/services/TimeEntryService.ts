//TimeEntryService
import { PrismaClient, Prisma, TimeEntry, LeaveRequest } from '@prisma/client';
import {
  addDays,
  addHours,
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  max,
  min,
  parseISO,
  subMinutes,
  isBefore,
  isAfter,
} from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { NotificationService } from './NotificationService';
import { cacheService } from './CacheService';
import {
  ApprovedOvertimeInfo,
  PeriodType,
  StatusUpdateResult,
  TimeEntryStatus,
  ProcessingOptions,
  AttendanceRecord,
  ShiftData,
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
    if (process.env.NODE_ENV === 'test') {
      return this.getTestTimeEntry(attendance);
    }

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

    if (options.isOvertime && overtimeRequest) {
      const overtimeEntry = await this.handleOvertimeEntry(
        tx,
        attendance,
        overtimeRequest,
        options.isCheckIn,
      );
      return { overtime: [overtimeEntry] };
    }

    const regularEntry = await this.handleRegularEntry(
      tx,
      attendance,
      options.isCheckIn,
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
        entryType: 'regular',
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
      if (options.isCheckIn && !options.isOvertime && result.regular) {
        if (shift?.effectiveShift) {
          const shiftStart = this.parseShiftTime(
            shift.effectiveShift.startTime,
            attendance.date,
          );

          const { minutesLate, isHalfDayLate } = this.calculateLateStatus(
            attendance.regularCheckInTime!,
            shiftStart,
          );

          if (minutesLate > this.LATE_THRESHOLD && !leaveRequests.length) {
            await this.notifyLateCheckIn(
              attendance.employeeId,
              attendance.regularCheckInTime!,
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

  private async handleOvertimeEntry(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    overtimeRequest: ApprovedOvertimeInfo,
    isCheckIn: boolean,
  ): Promise<TimeEntry> {
    const existingEntry = await tx.timeEntry.findFirst({
      where: {
        attendanceId: attendance.id,
        entryType: 'overtime',
      },
      include: { overtimeMetadata: true },
    });

    const overtimeData = this.prepareOvertimeData(
      attendance,
      overtimeRequest,
      isCheckIn,
    );

    if (existingEntry) {
      return this.updateOvertimeEntry(tx, existingEntry.id, overtimeData);
    }

    return this.createOvertimeEntry(
      tx,
      attendance,
      overtimeRequest,
      overtimeData,
    );
  }

  private prepareOvertimeData(
    attendance: AttendanceRecord,
    overtimeRequest: ApprovedOvertimeInfo,
    isCheckIn: boolean,
  ) {
    const overtimeHours =
      !isCheckIn && attendance.regularCheckOutTime
        ? this.calculateOvertimeHours(
            attendance.regularCheckInTime!,
            attendance.regularCheckOutTime,
            overtimeRequest,
            null,
            null,
          ).hours
        : 0;

    return {
      date: attendance.date,
      startTime: attendance.regularCheckInTime || attendance.date,
      endTime: attendance.regularCheckOutTime || null,
      regularHours: 0,
      overtimeHours,
      status: isCheckIn
        ? TimeEntryStatus.IN_PROGRESS
        : TimeEntryStatus.COMPLETED,
      entryType: 'overtime' as const,
      overtimeMetadata: {
        isDayOffOvertime: overtimeRequest.isDayOffOvertime,
        isInsideShiftHours: overtimeRequest.isInsideShiftHours,
      },
    };
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
        ? this.calculateLateStatus(
            attendance.regularCheckInTime!,
            shiftTimes.start,
          )
        : { minutesLate: 0, isHalfDayLate: false };

    // Calculate working hours for check-out if all required times exist
    const workingHours =
      !isCheckIn && shiftTimes.start && shiftTimes.end
        ? this.calculateWorkingHours(
            attendance.regularCheckInTime!,
            attendance.regularCheckOutTime,
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
      startTime: attendance.regularCheckInTime || attendance.date,
      endTime: attendance.regularCheckOutTime || null,
      regularHours: metrics.regularHours,
      overtimeHours: 0,
      actualMinutesLate: metrics.minutesLate,
      isHalfDayLate: metrics.isHalfDayLate,
      status: isCheckIn
        ? TimeEntryStatus.IN_PROGRESS
        : TimeEntryStatus.COMPLETED,
      entryType: 'regular' as const,
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
              `แผนก: ${employee.department?.name ?? 'ไม่ระบุ'}`,
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

  private calculateWorkingHours(
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

    const breakStart = addHours(shiftStart, this.BREAK_START_OFFSET);
    const breakEnd = addMinutes(breakStart, this.BREAK_DURATION_MINUTES);

    const effectiveMinutes = this.calculateEffectiveMinutes(
      checkInTime,
      checkOutTime,
      breakStart,
      breakEnd,
    );

    const hasHalfDayLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(new Date(leave.startDate), checkInTime),
    );

    const maxRegularHours = hasHalfDayLeave
      ? this.REGULAR_HOURS_PER_SHIFT / 2
      : this.REGULAR_HOURS_PER_SHIFT;

    return {
      regularHours: Math.min(effectiveMinutes / 60, maxRegularHours),
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

    // Round to nearest increment
    const roundedMinutes =
      Math.floor(overtimeMinutes / this.OVERTIME_INCREMENT) *
      this.OVERTIME_INCREMENT;
    const overtimeHours = roundedMinutes / 60;

    return {
      hours: overtimeHours,
      metadata:
        overtimeHours > 0
          ? {
              isDayOffOvertime: overtimeRequest.isDayOffOvertime,
              isInsideShiftHours: overtimeRequest.isInsideShiftHours,
            }
          : null,
    };
  }

  public calculateOvertimeDuration(
    attendance: AttendanceRecord,
    approvedOvertime: ApprovedOvertimeInfo,
    currentTime: Date,
  ): number {
    if (!attendance.regularCheckInTime) return 0;

    const result = this.calculateOvertimeHours(
      attendance.regularCheckInTime,
      attendance.regularCheckOutTime || currentTime,
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

  private getTestTimeEntry(attendance: AttendanceRecord) {
    return {
      regular: {
        id: 'test-entry',
        employeeId: attendance.employeeId,
        date: attendance.date,
        startTime: attendance.regularCheckInTime || new Date(),
        endTime: attendance.regularCheckOutTime,
        status: 'completed',
        entryType: PeriodType.REGULAR,
        regularHours: 8,
        overtimeHours: 0,
        attendanceId: attendance.id,
        overtimeRequestId: null,
        actualMinutesLate: 0,
        isHalfDayLate: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      overtime: [],
    };
  }

  private async updateOvertimeEntry(
    tx: Prisma.TransactionClient,
    id: string,
    data: any,
  ): Promise<TimeEntry> {
    return tx.timeEntry.update({
      where: { id },
      data: {
        ...data,
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

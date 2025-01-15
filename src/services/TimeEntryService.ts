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
  parseISO,
  subMinutes,
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

    if (options.periodType === PeriodType.OVERTIME) {
      // Handle overtime entry
      const overtimeEntry = await this.handleOvertimeEntry(
        tx,
        attendance,
        context.overtimeRequest!,
        options.activity.isCheckIn,
      );
      return { overtime: [overtimeEntry] };
    }

    // Handle regular entry
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
    console.log('Handle regular entry:', {
      isCheckIn,
      attendanceId: attendance.id,
      checkInTime: format(attendance.CheckInTime!, 'HH:mm:ss'),
      checkOutTime: attendance.CheckOutTime
        ? format(attendance.CheckOutTime, 'HH:mm:ss')
        : null,
    });

    const existingEntry = await tx.timeEntry.findFirst({
      where: {
        attendanceId: attendance.id,
        entryType: PeriodType.REGULAR,
        status: 'STARTED',
      },
    });

    // Get shift times and calculate metrics
    const shiftTimes = this.getShiftTimes(shift, attendance.date);
    const metrics = this.calculateEntryMetrics(
      attendance,
      isCheckIn,
      shiftTimes,
      leaveRequests,
    );

    // Prepare regular entry data
    const entryData = this.prepareRegularEntryData(
      attendance,
      metrics,
      isCheckIn,
    );

    if (isCheckIn) {
      if (existingEntry) {
        console.warn('Found existing regular entry on check-in:', {
          entryId: existingEntry.id,
          attendanceId: attendance.id,
        });
      }

      return tx.timeEntry.create({
        data: {
          ...entryData,
          employeeId: attendance.employeeId,
          attendanceId: attendance.id,
        },
      });
    }

    // Handle checkout
    if (!existingEntry) {
      console.error('No existing regular entry found for checkout:', {
        attendanceId: attendance.id,
      });
      throw new Error('No existing regular entry found for checkout');
    }

    // Calculate working hours considering leaves
    const workingHours = this.calculateWorkingHours(
      attendance.CheckInTime!,
      attendance.CheckOutTime!,
      shiftTimes.start!,
      shiftTimes.end!,
      null,
      leaveRequests,
    );

    console.log('Updating regular entry:', {
      entryId: existingEntry.id,
      regularHours: workingHours.regularHours,
      checkOutTime: format(attendance.CheckOutTime!, 'HH:mm:ss'),
    });

    return tx.timeEntry.update({
      where: { id: existingEntry.id },
      data: {
        endTime: attendance.CheckOutTime,
        status: TimeEntryStatus.COMPLETED,
        hours: {
          regular: workingHours.regularHours, // Will be 8 hours or 4 for half day
          overtime: 0,
        },
        metadata: {
          source: 'system',
          version: 1,
          updatedAt: new Date(),
        },
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
        await this.processLateCheckIn(attendance, shift, leaveRequests);
      }
    } catch (error) {
      console.error('Post-processing error:', {
        error,
        employeeId: attendance.employeeId,
        timestamp: getCurrentTime(),
      });
    }
  }

  private async processLateCheckIn(
    attendance: AttendanceRecord,
    shift: any,
    leaveRequests: LeaveRequest[],
  ) {
    if (!shift?.effectiveShift || !attendance.CheckInTime) return;

    const shiftStart = this.parseShiftTime(
      shift.effectiveShift.startTime,
      attendance.date,
    );

    const { minutesLate, isHalfDayLate } = this.calculateLateStatus(
      attendance.CheckInTime,
      shiftStart,
    );

    // Check if notification should be sent
    if (minutesLate <= this.LATE_THRESHOLD) return;

    // Check for approved leaves that would affect notification
    const hasApprovedLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'approved' &&
        isSameDay(new Date(leave.startDate), attendance.date) &&
        (leave.leaveFormat === 'ลาเต็มวัน' ||
          leave.leaveFormat === 'ลาครึ่งวัน'),
    );

    if (hasApprovedLeave) return;

    // Check for pending emergency leave
    const hasPendingEmergencyLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'pending' &&
        leave.leaveFormat === 'ลาฉุกเฉิน' &&
        isSameDay(new Date(leave.startDate), attendance.date),
    );

    await this.notifyLateCheckIn(
      attendance.employeeId,
      attendance.CheckInTime,
      minutesLate,
      isHalfDayLate,
      hasPendingEmergencyLeave,
    );
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
        create: {
          isDayOffOvertime: overtimeRequest.isDayOffOvertime,
          isInsideShiftHours: overtimeRequest.isInsideShiftHours,
        },
      },
    };

    if (isCheckIn) {
      return {
        ...baseData,
        startTime: attendance.CheckInTime!,
        endTime: null,
        hours: {
          regular: 0,
          overtime: 0,
        },
        status: TimeEntryStatus.STARTED,
        metadata: {
          source: 'system',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };
    }

    const workMinutes = differenceInMinutes(
      attendance.CheckOutTime!,
      attendance.CheckInTime!,
    );

    return {
      ...baseData,
      startTime: attendance.CheckInTime!,
      endTime: attendance.CheckOutTime!,
      hours: {
        regular: 0,
        overtime: workMinutes / 60,
      },
      status: TimeEntryStatus.COMPLETED,
      metadata: {
        source: 'system',
        version: 1,
        updatedAt: new Date(),
      },
    };
  }

  private async handleOvertimeEntry(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    overtimeRequest: ApprovedOvertimeInfo,
    isCheckIn: boolean,
  ): Promise<TimeEntry> {
    console.log('Handle overtime entry:', {
      isCheckIn,
      attendanceId: attendance.id,
      checkInTime: format(attendance.CheckInTime!, 'HH:mm:ss'),
      checkOutTime: attendance.CheckOutTime
        ? format(attendance.CheckOutTime, 'HH:mm:ss')
        : null,
      overtimeId: overtimeRequest.id,
    });

    // Find existing entry
    const existingEntry = await tx.timeEntry.findFirst({
      where: {
        attendanceId: attendance.id,
        entryType: PeriodType.OVERTIME,
        status: 'STARTED',
      },
    });

    // Prepare overtime data
    const entryData = this.prepareOvertimeData(
      attendance,
      overtimeRequest,
      isCheckIn,
    );

    if (isCheckIn) {
      if (existingEntry) {
        console.warn('Found existing overtime entry on check-in:', {
          entryId: existingEntry.id,
          attendanceId: attendance.id,
        });
      }

      return tx.timeEntry.create({
        data: {
          ...entryData,
          employeeId: attendance.employeeId,
          attendanceId: attendance.id,
          overtimeRequestId: overtimeRequest.id,
          timing: {
            actualMinutesLate: 0,
            isHalfDayLate: false,
          },
          // Additional metadata comes from prepareOvertimeData
        },
      });
    }

    // Handle checkout
    if (!existingEntry) {
      console.error('No existing overtime entry found for checkout:', {
        attendanceId: attendance.id,
        overtimeId: overtimeRequest.id,
      });
      throw new Error('No existing overtime entry found for checkout');
    }

    // Calculate hours based on approved overtime boundaries
    const { hours, metadata } = this.calculateOvertimeHours(
      attendance.CheckInTime!,
      attendance.CheckOutTime!,
      overtimeRequest,
      null,
      null,
    );

    console.log('Updating overtime entry:', {
      entryId: existingEntry.id,
      hours,
      checkOutTime: format(attendance.CheckOutTime!, 'HH:mm:ss'),
    });

    return tx.timeEntry.update({
      where: { id: existingEntry.id },
      data: {
        endTime: attendance.CheckOutTime,
        status: TimeEntryStatus.COMPLETED,
        hours: {
          regular: 0,
          overtime: hours, // Uses approved overtime duration
        },
        metadata: {
          source: 'system',
          version: 1,
          updatedAt: new Date(),
        },
      },
    });
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
    isEmergency: boolean = false,
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
        employeeId: true,
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

    // Prepare notification message
    const messageLines = [
      '🔔 แจ้งเตือนการมาสาย',
      `พนักงาน: ${employee.name}`,
      `รหัส: ${employee.employeeId}`,
      `แผนก: ${employee.department?.name || 'ไม่ระบุ'}`,
      `วันที่: ${formattedDate}`,
      `เวลาเข้างาน: ${formattedTime} น.`,
      `สาย: ${Math.floor(minutesLate)} นาที`,
    ];

    if (isHalfDayLate) {
      messageLines.push('⚠️ สายเกิน 4 ชั่วโมง (ถือเป็นการลาครึ่งวัน)');
    }

    if (isEmergency) {
      messageLines.push('📝 อยู่ระหว่างรอการอนุมัติลาฉุกเฉิน');
    }

    // Send to each admin
    for (const admin of admins) {
      if (admin.lineUserId) {
        try {
          const message = {
            type: 'text',
            text: messageLines.join('\n'),
          };

          await this.notificationService.sendNotification(
            admin.employeeId,
            admin.lineUserId,
            JSON.stringify(message),
            'attendance',
          );

          console.log('Late check-in notification sent:', {
            employeeId,
            adminId: admin.employeeId,
            minutesLate,
            isHalfDayLate,
            isEmergency,
            timestamp: getCurrentTime(),
          });
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
    console.log('Calculating overtime hours:', {
      checkIn: format(checkInTime, 'HH:mm:ss'),
      checkout: format(checkOutTime, 'HH:mm:ss'),
      overtime: {
        startTime: overtimeRequest.startTime,
        endTime: overtimeRequest.endTime,
      },
    });

    // Convert overtime period boundaries to Date objects
    const overtimeStart = parseISO(
      `${format(checkInTime, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
    );
    let overtimeEnd = parseISO(
      `${format(checkInTime, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
    );

    // Handle overnight period
    const isOvernight = overtimeEnd < overtimeStart;
    if (isOvernight) {
      overtimeEnd = addDays(overtimeEnd, 1);
    }

    // Use period start time if checked in early
    const effectiveStartTime =
      checkInTime < overtimeStart ? overtimeStart : checkInTime;

    // Check if within late checkout allowance (5 minutes after period end)
    const lateCheckoutAllowance = addMinutes(overtimeEnd, 5);
    const isWithinLateAllowance =
      checkOutTime > overtimeEnd && checkOutTime <= lateCheckoutAllowance;

    // Use period end time if within allowance
    const effectiveEndTime = isWithinLateAllowance ? overtimeEnd : checkOutTime;

    // Calculate worked minutes
    const workedMinutes = Math.max(
      0,
      differenceInMinutes(effectiveEndTime, effectiveStartTime),
    );

    // Calculate completed 30-minute cycles
    const completedCycles = Math.floor(workedMinutes / 30);
    const overtimeMinutes = completedCycles * 30;

    console.log('Overtime calculation details:', {
      period: {
        start: format(overtimeStart, 'HH:mm:ss'),
        end: format(overtimeEnd, 'HH:mm:ss'),
      },
      effective: {
        start: format(effectiveStartTime, 'HH:mm:ss'),
        end: format(effectiveEndTime, 'HH:mm:ss'),
      },
      workedMinutes,
      completedCycles,
      overtimeMinutes,
      isWithinLateAllowance,
    });

    return {
      hours: overtimeMinutes / 60,
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
}

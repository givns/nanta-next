//TimeEntryService
import {
  PrismaClient,
  Prisma,
  TimeEntry,
  LeaveRequest,
  PeriodType,
  TimeEntryStatus,
} from '@prisma/client';
import {
  addDays,
  addHours,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  format,
  isSameDay,
  max,
  min,
  parse,
  parseISO,
  startOfDay,
  subDays,
} from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { NotificationService } from './NotificationService';
import { cacheService } from './cache/CacheService';
import {
  ApprovedOvertimeInfo,
  StatusUpdateResult,
  ProcessingOptions,
  AttendanceRecord,
  TimeEntryHours,
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
      // For regular period check-in, skip overtime matching
      if (
        options.periodType === PeriodType.REGULAR &&
        options.activity.isCheckIn
      ) {
        // Pre-fetch data for regular entry
        const [leaveRequests, shift] = await Promise.all([
          this.leaveService.getLeaveRequests(options.employeeId),
          this.shiftService.getEffectiveShift(
            attendance.employeeId,
            attendance.date,
          ),
        ]);

        const result = await this.processEntriesWithContext(
          tx,
          attendance,
          options,
          {
            overtimeRequest: null,
            leaveRequests,
            shift,
          },
        );

        return {
          regular: result.regular
            ? this.ensureProcessedEntry(result.regular)
            : undefined,
        };
      }

      // For overtime or check-out cases, proceed with overtime matching
      const overtimes = await this.overtimeService.getDetailedOvertimesInRange(
        options.employeeId,
        startOfDay(subDays(new Date(options.checkTime), 1)),
        endOfDay(new Date(options.checkTime)),
      );

      // Match overtime only if needed (for overtime periods or check-outs)
      const matchedOvertime = overtimes?.find((ot) => {
        const checkInTime = attendance.CheckInTime!;

        // For check-in, only match start time
        if (options.activity.isCheckIn) {
          const [startHour, startMinute] = ot.startTime.split(':').map(Number);
          const startTimeInMinutes = startHour * 60 + startMinute;
          const checkInTimeInMinutes =
            checkInTime.getHours() * 60 + checkInTime.getMinutes();

          // Allow early check-in window
          const earlyWindowMinutes = startTimeInMinutes - 30; // 30 minutes early window
          return (
            checkInTimeInMinutes >= earlyWindowMinutes &&
            checkInTimeInMinutes <= startTimeInMinutes + 15
          ); // 15 minutes late window
        }

        // For check-out, check both start and end times
        if (attendance.CheckOutTime) {
          const [startHour, startMinute] = ot.startTime.split(':').map(Number);
          const [endHour, endMinute] = ot.endTime.split(':').map(Number);

          const startTimeInMinutes = startHour * 60 + startMinute;
          const endTimeInMinutes = endHour * 60 + endMinute;

          const checkOutTime = attendance.CheckOutTime;
          const checkOutTimeInMinutes =
            checkOutTime.getHours() * 60 + checkOutTime.getMinutes();

          return (
            checkOutTimeInMinutes >= startTimeInMinutes &&
            checkOutTimeInMinutes <= endTimeInMinutes
          );
        }

        return false;
      });

      console.log('Overtime matching details:', {
        checkInTime: {
          full: attendance.CheckInTime,
          formatted: attendance.CheckInTime
            ? format(attendance.CheckInTime, 'HH:mm:ss')
            : null,
        },
        checkOutTime: attendance.CheckOutTime
          ? format(attendance.CheckOutTime, 'HH:mm:ss')
          : null,
        availableOvertimes: overtimes?.map((ot) => ({
          start: ot.startTime,
          end: ot.endTime,
        })),
        matched: matchedOvertime
          ? { start: matchedOvertime.startTime, end: matchedOvertime.endTime }
          : null,
      });

      // Fetch required data
      const [leaveRequests, shift] = await Promise.all([
        this.leaveService.getLeaveRequests(options.employeeId),
        this.shiftService.getEffectiveShift(
          attendance.employeeId,
          attendance.date,
        ),
      ]);

      // Process entries
      const result = await this.processEntriesWithContext(
        tx,
        attendance,
        options,
        {
          overtimeRequest: matchedOvertime || null,
          leaveRequests,
          shift,
        },
      );

      // Handle post-processing
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

      return {
        regular: result.regular
          ? this.ensureProcessedEntry(result.regular)
          : undefined,
        overtime: result.overtime?.map((entry) =>
          this.ensureProcessedEntry(entry),
        ),
      };
    } catch (error) {
      console.error('Error processing time entries:', error);
      throw error;
    }
  }

  private ensureProcessedEntry(entry: any): TimeEntry {
    // Ensure hours are properly formed
    const hours: TimeEntryHours = {
      regular: Number(entry.hours?.regular || 0),
      overtime: Number(entry.hours?.overtime || 0),
    };

    return {
      ...entry,
      hours,
      // Ensure other required fields are present
      metadata: {
        source: entry.metadata?.source || 'system',
        version: Number(entry.metadata?.version || 1),
        createdAt: new Date(entry.metadata?.createdAt || Date.now()),
        updatedAt: new Date(entry.metadata?.updatedAt || Date.now()),
      },
      timing: {
        actualMinutesLate: Number(entry.timing?.actualMinutesLate || 0),
        isHalfDayLate: Boolean(entry.timing?.isHalfDayLate),
      },
    };
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
  ): Promise<{
    regular?: TimeEntry;
    overtime?: TimeEntry[];
  }> {
    const { overtimeRequest, leaveRequests } = context;

    if (options.periodType === PeriodType.OVERTIME) {
      const overtimeEntry = await this.handleOvertimeEntry(
        tx,
        attendance,
        overtimeRequest!,
        options.activity.isCheckIn,
      );
      return { overtime: [this.ensureProcessedEntry(overtimeEntry)] };
    }

    const regularEntry = await this.handleRegularEntry(
      tx,
      attendance,
      options.activity.isCheckIn,
      leaveRequests,
      context.shift,
    );
    return { regular: this.ensureProcessedEntry(regularEntry) };
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
      overtimePeriod: {
        startTime: overtimeRequest.startTime,
        endTime: overtimeRequest.endTime,
      },
    });

    // Use the overtime period's start time for creating/updating time entries
    const effectiveStartTime = parse(
      overtimeRequest.startTime,
      'HH:mm',
      attendance.CheckInTime!,
    );

    // Find existing entry
    const existingEntry = await tx.timeEntry.findFirst({
      where: {
        attendanceId: attendance.id,
        entryType: PeriodType.OVERTIME,
        status: 'STARTED',
      },
    });

    if (isCheckIn) {
      return tx.timeEntry.create({
        data: {
          employeeId: attendance.employeeId,
          date: attendance.date,
          startTime: effectiveStartTime, // Use overtime start time
          status: TimeEntryStatus.STARTED,
          entryType: PeriodType.OVERTIME,
          attendanceId: attendance.id,
          overtimeRequestId: overtimeRequest.id,
          hours: {
            regular: 0,
            overtime: 0,
          },
          metadata: {
            source: 'system',
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      });
    }

    if (!existingEntry) {
      throw new Error('No existing overtime entry found for checkout');
    }

    // Calculate hours based on matched overtime period
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
      period: {
        start: overtimeRequest.startTime,
        end: overtimeRequest.endTime,
      },
    });

    return tx.timeEntry.update({
      where: { id: existingEntry.id },
      data: {
        endTime: attendance.CheckOutTime,
        status: TimeEntryStatus.COMPLETED,
        hours: {
          regular: 0,
          overtime: hours,
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

    // First check for leaves as they override actual worked hours
    const hasFullDayLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'approved' &&
        leave.leaveFormat === 'ลาเต็มวัน' &&
        isSameDay(new Date(leave.startDate), checkInTime),
    );

    if (hasFullDayLeave) {
      return {
        regularHours: this.REGULAR_HOURS_PER_SHIFT, // Always 8 hours for full day leave
        overtimeHours: 0,
        overtimeMetadata: null,
      };
    }

    const hasHalfDayLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(new Date(leave.startDate), checkInTime),
    );

    if (hasHalfDayLeave) {
      return {
        regularHours: this.REGULAR_HOURS_PER_SHIFT / 2, // Always 4 hours for half day leave
        overtimeHours: 0,
        overtimeMetadata: null,
      };
    }

    // For regular attendance
    const effectiveStart = checkInTime;
    const effectiveEnd = checkOutTime;

    // Calculate break time deduction
    const breakStart = addHours(shiftStart, this.BREAK_START_OFFSET);
    const breakEnd = addMinutes(breakStart, this.BREAK_DURATION_MINUTES);

    // Calculate minutes worked excluding break
    const effectiveMinutes = this.calculateEffectiveMinutes(
      effectiveStart,
      effectiveEnd,
      breakStart,
      breakEnd,
    );

    // Check if very late (over 4 hours late)
    const minutesLate = Math.max(
      0,
      differenceInMinutes(checkInTime, shiftStart),
    );
    const isVeryLate = minutesLate >= 240; // 4 hours

    if (isVeryLate) {
      return {
        regularHours: this.REGULAR_HOURS_PER_SHIFT / 2, // Half day for very late
        overtimeHours: 0,
        overtimeMetadata: null,
      };
    }

    // For normal cases, always maintain 8 hours if worked full shift
    const totalMinutesInShift = differenceInMinutes(shiftEnd, shiftStart);
    const minimumRequiredMinutes = totalMinutesInShift * 0.75; // 75% of shift duration

    console.log('Working hours calculation:', {
      checkIn: format(checkInTime, 'HH:mm:ss'),
      checkOut: format(checkOutTime, 'HH:mm:ss'),
      effectiveMinutes,
      totalMinutesInShift,
      minimumRequiredMinutes,
    });

    // If worked at least 75% of shift, give full 8 hours
    if (effectiveMinutes >= minimumRequiredMinutes) {
      return {
        regularHours: this.REGULAR_HOURS_PER_SHIFT,
        overtimeHours: 0,
        overtimeMetadata: null,
      };
    }

    // For partial days (not meeting minimum threshold)
    return {
      regularHours: Math.min(
        Math.max(effectiveMinutes / 60, 4), // Minimum 4 hours if not very late
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
    // If work period doesn't overlap with break, return full duration
    if (endTime <= breakStart || startTime >= breakEnd) {
      return differenceInMinutes(endTime, startTime);
    }

    // If work period fully contains break, subtract break duration
    if (startTime <= breakStart && endTime >= breakEnd) {
      return (
        differenceInMinutes(endTime, startTime) - this.BREAK_DURATION_MINUTES
      );
    }

    // If work period partially overlaps with break
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
    // Convert overtime period boundaries to Date objects
    const overtimeStart = parseISO(
      `${format(checkInTime, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
    );
    let overtimeEnd = parseISO(
      `${format(checkInTime, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
    );

    // Determine if overnight by comparing times
    const isOvernight = overtimeEnd < overtimeStart;
    if (isOvernight) {
      overtimeEnd = addDays(overtimeEnd, 1);
    }

    // Apply 15-minute late start allowance but bound by period
    const lateStartAllowance = addMinutes(overtimeStart, 15);
    const isWithinLateStartAllowance =
      checkInTime > overtimeStart && checkInTime <= lateStartAllowance;

    // Use period start if within late start allowance or check-in is earlier
    const effectiveStartTime =
      checkInTime <= lateStartAllowance ? overtimeStart : checkInTime;

    // IMPORTANT: Always bound by period end time
    const effectiveEndTime = min([checkOutTime, overtimeEnd]);

    // Calculate total worked minutes within period bounds
    const workedMinutes = differenceInMinutes(
      effectiveEndTime,
      effectiveStartTime,
    );

    // Special handling for minutes near period boundaries
    const remainderMinutes = workedMinutes % 30;
    let overtimeMinutes = 0;

    if (workedMinutes >= 25) {
      // Minimum threshold for any overtime
      // If within 5 minutes of period end, round up to period end
      const isNearPeriodEnd =
        effectiveEndTime === overtimeEnd && remainderMinutes >= 25;

      if (isNearPeriodEnd) {
        overtimeMinutes = workedMinutes + (30 - remainderMinutes);
      } else {
        // Normal rounding to 30-minute increments
        overtimeMinutes = workedMinutes - remainderMinutes;
        if (remainderMinutes >= 15) {
          overtimeMinutes += 30;
        }
      }
    }

    console.log('Overtime calculation details:', {
      period: {
        start: format(overtimeStart, 'HH:mm:ss'),
        end: format(overtimeEnd, 'HH:mm:ss'),
        isOvernight,
      },
      times: {
        checkIn: format(checkInTime, 'HH:mm:ss'),
        checkOut: format(checkOutTime, 'HH:mm:ss'),
      },
      effective: {
        start: format(effectiveStartTime, 'HH:mm:ss'),
        end: format(effectiveEndTime, 'HH:mm:ss'),
      },
      workedMinutes,
      remainderMinutes,
      overtimeMinutes,
    });

    return {
      hours: overtimeMinutes / 60,
      metadata: {
        isDayOffOvertime: overtimeRequest.isDayOffOvertime,
        isInsideShiftHours: overtimeRequest.isInsideShiftHours,
      },
    };
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

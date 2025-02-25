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
  addHours,
  addMinutes,
  differenceInMinutes,
  endOfDay,
  format,
  isSameDay,
  max,
  min,
  parse,
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
  PeriodState,
} from '../types/attendance';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { LeaveServiceServer } from './LeaveServiceServer';
import { th } from 'date-fns/locale';
import { getCurrentTime } from '@/utils/dateUtils';
import { late } from 'zod';

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

interface lateStatus {
  minutesLate: number;
  isHalfDayLate: boolean;
}

export class TimeEntryService {
  // Constants
  private readonly REGULAR_HOURS_PER_SHIFT = 8;
  private readonly LATE_THRESHOLD = 30;
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
    periodState: PeriodState,
  ): Promise<{
    regular?: TimeEntry;
    overtime?: TimeEntry[];
  }> {
    try {
      console.log('Starting processTimeEntries:', {
        attendanceId: attendance.id,
        employeeId: attendance.employeeId,
        options: {
          periodType: options.periodType,
          isCheckIn: options.activity.isCheckIn,
          isOvertime: options.activity.isOvertime,
          statusUpdate,
          periodState,
        },
      });
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

        // Calculate late status
        const lateStatus = this.calculateLateStatus(attendance, periodState);

        const result = await this.processEntriesWithContext(
          tx,
          attendance,
          options,
          {
            overtimeRequest: null,
            leaveRequests,
            shift,
          },
          lateStatus,
        );
        console.log('Shift data before post-processing:', {
          employeeId: attendance.employeeId,
          hasShift: !!shift,
          shiftDetails: shift
            ? {
                effectiveShift: shift,
                current: shift.current,
              }
            : 'No shift data',
          periodState,
        });

        await this.handlePostProcessing(
          attendance,
          options,
          result,
          shift,
          leaveRequests,
          lateStatus,
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

      const lateStatus = this.calculateLateStatus(attendance, periodState);

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
        lateStatus,
      );

      // Handle post-processing

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
    lateStatus: lateStatus,
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
      lateStatus,
    );
    return { regular: this.ensureProcessedEntry(regularEntry) };
  }

  private async handleRegularEntry(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord,
    isCheckIn: boolean,
    leaveRequests: LeaveRequest[],
    shift: any,
    lateStatus: lateStatus,
  ): Promise<TimeEntry> {
    // Safely access shift data
    const shiftStartTime =
      shift?.current?.startTime || shift?.effectiveShift?.startTime;
    if (!shiftStartTime) {
      console.error('Missing shift start time:', {
        shiftData: shift,
        attendanceId: attendance.id,
      });
      throw new Error('Invalid shift configuration');
    }

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
    const shiftTimes = {
      start: this.parseShiftTime(shiftStartTime, attendance.date),
      end: this.parseShiftTime(
        shift?.current?.endTime || shift?.effectiveShift?.endTime,
        attendance.date,
      ),
    };

    const metrics = this.calculateEntryMetrics(
      attendance,
      isCheckIn,
      shiftTimes,
      leaveRequests,
      lateStatus,
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
          regular: workingHours.regularHours,
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
    lateStatus: lateStatus,
  ) {
    try {
      console.log('Post-processing:', {
        employeeId: attendance.employeeId,
        activity: options.activity,
        result,
        hasShiftData: shift,

        shiftTimes: shift?.current
          ? {
              startTime: shift.current.startTime,
              endTime: shift.current.endTime,
            }
          : 'Missing shift data',
        timestamp: getCurrentTime(),
      });

      if (!shift?.current) {
        console.warn('Missing shift data in post-processing:', {
          employeeId: attendance.employeeId,
          timestamp: getCurrentTime(),
        });
        return;
      }

      // Add condition check logging
      console.log('Post-processing conditions:', {
        isCheckIn: options.activity.isCheckIn,
        isNotOvertime: !options.activity.isOvertime,
        hasRegularResult: !!result.regular,
        allConditionsMet:
          options.activity.isCheckIn &&
          !options.activity.isOvertime &&
          !!result.regular,
        shiftData: {
          startTime: shift.current.startTime,
          endTime: shift.current.endTime,
        },
        leaveRequestsCount: leaveRequests.length,
      });

      if (
        options.activity.isCheckIn &&
        !options.activity.isOvertime &&
        result.regular
      ) {
        console.log('About to process late check-in:', {
          employeeId: attendance.employeeId,
          checkInTime: attendance.CheckInTime,
          shiftStart: shift.startTime,
          shiftData: {
            startTime: shift.current.startTime,
            endTime: shift.current.endTime,
          },
        });

        await this.processLateCheckIn(
          attendance,
          shift,
          leaveRequests,
          lateStatus,
        );
      } else {
        console.log('Skipping late check-in processing:', {
          reason: !options.activity.isCheckIn
            ? 'Not check-in'
            : options.activity.isOvertime
              ? 'Is overtime'
              : !result.regular
                ? 'No regular entry'
                : 'Unknown reason',
        });
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
    lateStatus: lateStatus,
  ) {
    console.log('Processing late check-in:', {
      employeeId: attendance.employeeId,
      checkInTime: attendance.CheckInTime
        ? format(attendance.CheckInTime, 'HH:mm:ss')
        : null,
      shiftData: shift?.current
        ? {
            startTime: shift.current.startTime,
            endTime: shift.current.endTime,
          }
        : 'Missing shift data',
      timestamp: getCurrentTime(),
    });

    if (!shift?.current || !attendance.CheckInTime) {
      console.warn('Missing required data for late check-in:', {
        hasShift: !!shift?.current,
        hasCheckInTime: !!attendance.CheckInTime,
        employeeId: attendance.employeeId,
      });
      return;
    }

    const shiftStart = this.parseShiftTime(
      shift.current.startTime,
      attendance.date,
    );

    console.log('Parsed shift times:', {
      originalStartTime: shift.current.startTime,
      parsedStartTime: format(shiftStart, 'HH:mm:ss'),
      attendanceDate: format(attendance.date, 'yyyy-MM-dd'),
    });

    const minutesLate = lateStatus.minutesLate;
    const isHalfDayLate = lateStatus.isHalfDayLate;

    console.log('Late Check-In Processing:', {
      minutesLate,
      lateThreshold: this.LATE_THRESHOLD,
      isHalfDayLate,
    });

    // Check if notification should be sent
    if (minutesLate <= this.LATE_THRESHOLD) {
      console.log('Skipping late notification - within threshold');
      return;
    }
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

    // Find existing entry - more specific query
    const existingEntry = await tx.timeEntry.findFirst({
      where: {
        attendanceId: attendance.id,
        entryType: PeriodType.OVERTIME,
        status: isCheckIn ? { not: TimeEntryStatus.COMPLETED } : undefined,
      },
    });

    console.log('Time entry lookup result:', {
      found: !!existingEntry,
      entryId: existingEntry?.id,
      status: existingEntry?.status,
    });

    if (isCheckIn) {
      if (existingEntry) {
        console.warn('Found existing overtime entry during check-in:', {
          entryId: existingEntry.id,
          status: existingEntry.status,
        });
        return existingEntry;
      }

      return tx.timeEntry.create({
        data: {
          employeeId: attendance.employeeId,
          date: attendance.date,
          startTime: effectiveStartTime,
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

    // Check-out handling - must have existing entry
    if (!existingEntry) {
      throw new Error('No existing overtime entry found for checkout');
    }

    // Calculate worked time based on actual check-in/out times
    const workMinutes = differenceInMinutes(
      attendance.CheckOutTime!,
      attendance.CheckInTime!,
    );

    // Round to nearest overtime increment (usually 30 mins)
    const OVERTIME_INCREMENT = 30;
    const roundedMinutes =
      Math.floor(workMinutes / OVERTIME_INCREMENT) * OVERTIME_INCREMENT;
    const overtimeHours = Math.max(0, roundedMinutes / 60);

    console.log('Calculating overtime hours:', {
      actualMinutes: workMinutes,
      roundedMinutes,
      overtimeHours,
      checkInTime: format(attendance.CheckInTime!, 'HH:mm:ss'),
      checkOutTime: format(attendance.CheckOutTime!, 'HH:mm:ss'),
    });

    // Update existing entry with actual worked time
    return tx.timeEntry.update({
      where: { id: existingEntry.id },
      data: {
        endTime: attendance.CheckOutTime,
        status: TimeEntryStatus.COMPLETED,
        hours: {
          regular: 0,
          overtime: overtimeHours,
        },
        metadata: {
          source: 'system',
          version: 1,
          updatedAt: new Date(),
        },
      },
    });
  }

  private calculateEntryMetrics(
    attendance: AttendanceRecord,
    isCheckIn: boolean,
    shiftTimes: { start: Date | null; end: Date | null },
    leaveRequests: LeaveRequest[],
    lateStatus: lateStatus,
  ): EntryMetricsResult {
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
  public calculateLateStatus(
    attendance: AttendanceRecord,
    periodState: PeriodState,
  ): { minutesLate: number; isHalfDayLate: boolean } {
    // First, validate CheckInTime - this is the critical fix
    if (!attendance.CheckInTime) {
      console.warn('No CheckInTime available for late status calculation', {
        employeeId: attendance.employeeId,
        recordId: attendance.id,
      });
      return { minutesLate: 0, isHalfDayLate: false };
    }

    // Proceed only if we have a valid CheckInTime
    const isLateCheckIn = periodState.current.validation.isLate;
    const minutesLate = attendance.checkTiming.lateCheckInMinutes;
    const isHalfDayLate = minutesLate >= 240;
    const periodType = periodState.current.type;

    console.log('Detailed Late Status Logging:', {
      employeeId: attendance.employeeId,
      isLateCheckIn,
      minutesLate,
      isHalfDayLate,
    });

    // Calculate late status considering full timestamp precision
    if (isLateCheckIn && periodType === PeriodType.REGULAR) {
      return { minutesLate, isHalfDayLate };
    }

    console.log('No Late Time Detected', {
      reason: 'Check-in not after shift start',
    });

    return { minutesLate: 0, isHalfDayLate: false };
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
          if (admins.length === 0) {
            console.warn('No admins found for late check-in notification');
          }
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

  public parseShiftTime(timeString: string, date: Date): Date {
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

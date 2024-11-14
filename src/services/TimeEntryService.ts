// services/TimeEntryService.ts
import {
  PrismaClient,
  Prisma,
  TimeEntry,
  Attendance,
  LeaveRequest,
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
  subMinutes,
} from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService';
import {
  ApprovedOvertime,
  AttendanceRecord,
  EnhancedAttendanceRecord,
  ShiftData,
} from '@/types/attendance';
import { NotificationService } from './NotificationService';
import { cacheService } from './CacheService';

interface WorkingHoursResult {
  regularHours: number;
  overtimeHours: number;
  overtimeMetadata: OvertimeMetadataInput | null;
}

interface OvertimeMetadataInput {
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
}

interface OvertimeResult {
  hours: number;
  metadata: OvertimeMetadataInput | null;
}

export class TimeEntryService {
  // Constants
  private readonly REGULAR_HOURS_PER_SHIFT = 8;
  private readonly OVERTIME_INCREMENT = 30; // 30 minutes increment for overtime
  private readonly LATE_THRESHOLD = 30; // 30 minutes threshold for considering "very late"
  private readonly HALF_DAY_THRESHOLD = 240; // 4 hours (in minutes)
  private readonly OVERTIME_MINIMUM_MINUTES = 30;
  private readonly OVERTIME_ROUND_TO_MINUTES = 30;
  private readonly BREAK_DURATION_MINUTES = 60; // 1 hour break
  private readonly BREAK_START_OFFSET = 4; // Break starts after 4 hours of work

  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
    private notificationService: NotificationService,
  ) {}

  // Main Public Methods
  async createOrUpdateTimeEntry(
    attendance: EnhancedAttendanceRecord,
    isCheckIn: boolean,
    approvedOvertimeRequest: ApprovedOvertime | null,
    leaveRequests: LeaveRequest[] = [],
  ): Promise<TimeEntry> {
    const effectiveShift = await this.getEffectiveShift(
      attendance.employeeId,
      attendance.date,
    );

    const shiftStart = this.parseShiftTime(
      effectiveShift.startTime,
      attendance.date,
    );
    const shiftEnd = this.parseShiftTime(
      effectiveShift.endTime,
      attendance.date,
    );

    // Handle check-in specifics
    const { minutesLate, isHalfDayLate } =
      isCheckIn && attendance.regularCheckInTime
        ? this.handleCheckInCalculations(
            attendance as Attendance,
            shiftStart,
            leaveRequests,
          )
        : { minutesLate: 0, isHalfDayLate: false };

    // Calculate working hours
    const workingHours = isCheckIn
      ? { regularHours: 0, overtimeHours: 0, overtimeMetadata: null }
      : this.calculateWorkingHours(
          attendance.regularCheckInTime!,
          attendance.regularCheckOutTime,
          shiftStart,
          shiftEnd,
          approvedOvertimeRequest,
          leaveRequests,
        );

    // Get existing entry
    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: { attendanceId: attendance.id },
      include: { overtimeMetadata: true },
    });

    if (existingEntry) {
      const updateData: Prisma.TimeEntryUpdateInput = {
        date: attendance.date,
        startTime: attendance.regularCheckInTime || attendance.date,
        endTime: attendance.regularCheckOutTime || null,
        regularHours: workingHours.regularHours,
        overtimeHours: workingHours.overtimeHours,
        actualMinutesLate: isCheckIn
          ? minutesLate
          : (existingEntry?.actualMinutesLate ?? 0),
        isHalfDayLate: isCheckIn
          ? isHalfDayLate
          : (existingEntry?.isHalfDayLate ?? false),
        status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
        attendance: {
          // Changed from attendanceId
          connect: { id: attendance.id },
        },
        overtimeRequest: approvedOvertimeRequest
          ? {
              // Changed from overtimeRequestId
              connect: { id: approvedOvertimeRequest.id },
            }
          : { disconnect: true }, // Disconnect if null
        entryType: workingHours.overtimeHours > 0 ? 'overtime' : 'regular',
        ...(workingHours.overtimeMetadata
          ? {
              overtimeMetadata: {
                upsert: {
                  create: workingHours.overtimeMetadata,
                  update: workingHours.overtimeMetadata,
                },
              },
            }
          : {}),
      };

      return this.prisma.timeEntry.update({
        where: { id: existingEntry.id },
        data: updateData,
        include: { overtimeMetadata: true },
      });
    } else {
      const createData: Prisma.TimeEntryCreateInput = {
        user: {
          connect: { employeeId: attendance.employeeId }, // Connect to user using employeeId
        },
        date: attendance.date,
        startTime: attendance.regularCheckInTime || attendance.date,
        endTime: attendance.regularCheckOutTime || null,
        regularHours: workingHours.regularHours,
        overtimeHours: workingHours.overtimeHours,
        actualMinutesLate: minutesLate,
        isHalfDayLate: isHalfDayLate,
        status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
        attendance: {
          connect: { id: attendance.id },
        },
        overtimeRequest: approvedOvertimeRequest
          ? {
              connect: { id: approvedOvertimeRequest.id },
            }
          : undefined,
        entryType: workingHours.overtimeHours > 0 ? 'overtime' : 'regular',
        ...(workingHours.overtimeMetadata
          ? {
              overtimeMetadata: {
                create: workingHours.overtimeMetadata,
              },
            }
          : {}),
      };

      return this.prisma.timeEntry.create({
        data: createData,
        include: { overtimeMetadata: true },
      });
    }
  }

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
        entryType: {
          in: ['regular', 'overtime', 'unpaid_leave'],
        },
      },
      include: {
        overtimeMetadata: true,
      },
    });

    if (cacheService) {
      await cacheService.set(cacheKey, JSON.stringify(entries), 300);
    }

    return entries;
  }

  async getTimeEntriesForPayroll(
    startDate: Date,
    endDate: Date,
  ): Promise<TimeEntry[]> {
    return await this.prisma.timeEntry.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: 'COMPLETED',
      },
      include: {
        user: true,
        overtimeMetadata: true,
      },
    });
  }

  // Private Helper Methods
  private calculateWorkingHours(
    checkInTime: Date,
    checkOutTime: Date | null,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
    leaveRequests: LeaveRequest[],
  ): WorkingHoursResult {
    if (!checkOutTime) {
      return { regularHours: 0, overtimeHours: 0, overtimeMetadata: null };
    }

    try {
      const { earlyCheckoutStart, regularCheckoutEnd } =
        this.getCheckoutWindow(shiftEnd);
      const checkoutStatus = this.getCheckoutStatus(checkOutTime, shiftEnd);

      // Calculate break period
      const breakStart = addHours(shiftStart, this.BREAK_START_OFFSET);
      const breakEnd = addMinutes(breakStart, this.BREAK_DURATION_MINUTES);

      // Calculate raw minutes worked
      let regularMinutes: number;

      if (checkoutStatus === 'normal' || checkoutStatus === 'late') {
        regularMinutes = this.calculateEffectiveMinutes(
          checkInTime,
          shiftEnd,
          breakStart,
          breakEnd,
        );
      } else if (
        checkoutStatus === 'early' &&
        checkOutTime >= earlyCheckoutStart
      ) {
        regularMinutes = this.calculateEffectiveMinutes(
          checkInTime,
          shiftEnd,
          breakStart,
          breakEnd,
        );
      } else {
        regularMinutes = this.calculateEffectiveMinutes(
          checkInTime,
          checkOutTime,
          breakStart,
          breakEnd,
        );
      }

      // Check for half-day leave
      const hasHalfDayLeave = leaveRequests.some(
        (leave) =>
          leave.status === 'approved' &&
          leave.leaveFormat === 'ลาครึ่งวัน' &&
          isSameDay(new Date(leave.startDate), checkInTime),
      );

      // Apply maximum hours
      const maxRegularHours = hasHalfDayLeave
        ? this.REGULAR_HOURS_PER_SHIFT / 2
        : this.REGULAR_HOURS_PER_SHIFT;

      const calculatedRegularHours = Math.min(
        regularMinutes / 60,
        maxRegularHours,
      );

      // Calculate overtime
      let overtimeResult: OvertimeResult = { hours: 0, metadata: null };

      if (approvedOvertimeRequest) {
        overtimeResult = this.calculateOvertimeHours(
          checkInTime,
          checkOutTime,
          approvedOvertimeRequest,
          breakStart,
          breakEnd,
        );
      }

      // Log calculation details
      console.log('Time calculation details:', {
        checkoutStatus,
        checkIn: format(checkInTime, 'HH:mm'),
        checkOut: format(checkOutTime, 'HH:mm'),
        breakStart: format(breakStart, 'HH:mm'),
        breakEnd: format(breakEnd, 'HH:mm'),
        rawMinutes: differenceInMinutes(checkOutTime, checkInTime),
        effectiveMinutes: regularMinutes,
        calculatedHours: calculatedRegularHours,
        overtimeHours: overtimeResult.hours,
      });

      return {
        regularHours: Math.max(
          0,
          Math.round(calculatedRegularHours * 100) / 100,
        ),
        overtimeHours: overtimeResult.hours,
        overtimeMetadata: overtimeResult.metadata,
      };
    } catch (error) {
      console.error('Error calculating working hours:', error);
      return { regularHours: 0, overtimeHours: 0, overtimeMetadata: null };
    }
  }

  private calculateEffectiveMinutes(
    startTime: Date,
    endTime: Date,
    breakStart: Date,
    breakEnd: Date,
  ): number {
    // If period doesn't include break time
    if (endTime <= breakStart || startTime >= breakEnd) {
      return differenceInMinutes(endTime, startTime);
    }

    // If period includes full break
    if (startTime <= breakStart && endTime >= breakEnd) {
      const totalMinutes = differenceInMinutes(endTime, startTime);
      return totalMinutes - this.BREAK_DURATION_MINUTES;
    }

    // If period overlaps part of break
    if (startTime < breakEnd && endTime > breakStart) {
      const overlapStart = max([startTime, breakStart]);
      const overlapEnd = min([endTime, breakEnd]);
      const breakOverlapMinutes = differenceInMinutes(overlapEnd, overlapStart);
      const totalMinutes = differenceInMinutes(endTime, startTime);
      return totalMinutes - breakOverlapMinutes;
    }

    // Fallback
    return differenceInMinutes(endTime, startTime);
  }

  public calculateOvertimeDuration(
    attendance: AttendanceRecord,
    approvedOvertime: ApprovedOvertime,
    currentTime: Date,
  ): number {
    if (!attendance.regularCheckInTime) {
      return 0;
    }

    // Instead of duplicating logic, use existing calculateOvertimeHours
    const result = this.calculateOvertimeHours(
      attendance.regularCheckInTime,
      attendance.regularCheckOutTime || currentTime,
      approvedOvertime,
      // Pass null for break times since breaks aren't counted in overtime
      null,
      null,
    );

    return result.hours;
  }

  // Update calculateOvertimeHours to handle null break times
  private calculateOvertimeHours(
    checkInTime: Date,
    checkOutTime: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
    breakStart: Date | null,
    breakEnd: Date | null,
  ): { hours: number; metadata: OvertimeMetadataInput | null } {
    if (!approvedOvertimeRequest) {
      return { hours: 0, metadata: null };
    }

    const overtimeStart = this.parseShiftTime(
      approvedOvertimeRequest.startTime,
      approvedOvertimeRequest.date,
    );
    let overtimeEnd = this.parseShiftTime(
      approvedOvertimeRequest.endTime,
      approvedOvertimeRequest.date,
    );

    // Handle overnight overtime
    if (overtimeEnd < overtimeStart) {
      overtimeEnd = addDays(overtimeEnd, 1);
    }

    const effectiveStartTime = max([checkInTime, overtimeStart]);
    const effectiveEndTime = min([checkOutTime, overtimeEnd]);

    // Calculate minutes without break deduction for overtime
    const overtimeMinutes =
      breakStart && breakEnd
        ? this.calculateEffectiveMinutes(
            effectiveStartTime,
            effectiveEndTime,
            breakStart,
            breakEnd,
          )
        : differenceInMinutes(effectiveEndTime, effectiveStartTime);

    const roundedOvertimeMinutes =
      this.calculateOvertimeIncrement(overtimeMinutes);
    const overtimeHours = Math.round((roundedOvertimeMinutes / 60) * 100) / 100;

    return {
      hours: overtimeHours,
      metadata:
        overtimeHours > 0
          ? {
              isDayOffOvertime: approvedOvertimeRequest.isDayOffOvertime,
              isInsideShiftHours: approvedOvertimeRequest.isInsideShiftHours,
            }
          : null,
    };
  }

  // Add helper method to handle early checkouts
  private isEarlyCheckout(checkOutTime: Date, shiftEnd: Date): boolean {
    return differenceInMinutes(checkOutTime, shiftEnd) < 0;
  }

  // You might also want to add this method to get accurate time windows
  private getCheckoutWindow(shiftEnd: Date): {
    earlyCheckoutStart: Date;
    regularCheckoutEnd: Date;
  } {
    return {
      earlyCheckoutStart: subMinutes(shiftEnd, 15), // 15 minutes before shift end
      regularCheckoutEnd: addMinutes(shiftEnd, 15), // 15 minutes after shift end
    };
  }

  // Add a method to determine the check-out status
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

  // Add a method to create a checkout status record
  async createCheckoutStatusRecord(
    employeeId: string,
    attendanceId: string,
    checkOutTime: Date,
    shiftEnd: Date,
  ): Promise<void> {
    const status = this.getCheckoutStatus(checkOutTime, shiftEnd);
    const minutesDeviation = differenceInMinutes(checkOutTime, shiftEnd);

    // If very early checkout, notify admin
    if (status === 'very_early') {
      await this.notifyAdminOfEarlyCheckout(
        employeeId,
        checkOutTime,
        shiftEnd,
        minutesDeviation,
      );
    }
  }

  private async notifyAdminOfEarlyCheckout(
    employeeId: string,
    checkOutTime: Date,
    shiftEnd: Date,
    minutesEarly: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      select: { name: true, departmentName: true },
    });

    if (!user) return;

    const message = {
      type: 'text',
      text:
        `แจ้งเตือน: พนักงานออกก่อนเวลา\n` +
        `พนักงาน: ${user.name}\n` +
        `แผนก: ${user.departmentName}\n` +
        `เวลาออก: ${format(checkOutTime, 'HH:mm')}\n` +
        `เวลาเลิกงาน: ${format(shiftEnd, 'HH:mm')}\n` +
        `ออกก่อน: ${Math.abs(minutesEarly)} นาที`,
    };

    // Send to admins
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['Admin', 'SuperAdmin'] } },
      select: { employeeId: true, lineUserId: true },
    });

    for (const admin of admins) {
      if (admin.lineUserId) {
        await this.notificationService.sendNotification(
          admin.employeeId,
          admin.lineUserId,
          JSON.stringify(message),
          'check-out',
        );
      }
    }
  }

  private handleCheckInCalculations(
    attendance: Attendance,
    shiftStart: Date,
    leaveRequests: LeaveRequest[],
  ) {
    const minutesLate = this.calculateLateMinutes(
      attendance.regularCheckInTime!,
      shiftStart,
    );
    const isHalfDayLate = minutesLate >= this.HALF_DAY_THRESHOLD;

    if (minutesLate > this.LATE_THRESHOLD && !leaveRequests.length) {
      this.notifyAdminOfLateness(
        attendance.employeeId,
        attendance.date,
        minutesLate,
        isHalfDayLate,
      ).catch((error) =>
        console.error('Failed to send late notification:', error),
      );
    }

    return { minutesLate, isHalfDayLate };
  }

  // Utility Methods
  private async notifyAdminOfLateness(
    employeeId: string,
    date: Date,
    minutesLate: number,
    isHalfDayLate: boolean,
  ): Promise<void> {
    console.log('Preparing admin notification for late check-in:', {
      employeeId,
      minutesLate,
      isHalfDayLate,
    });

    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      select: { name: true, departmentName: true, lineUserId: true },
    });

    if (!user) {
      console.log('User not found for late notification');
      return;
    }

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['Admin', 'SuperAdmin'] },
      },
      select: { employeeId: true, lineUserId: true },
    });

    console.log(`Found ${admins.length} admins to notify`);

    const message = {
      type: 'text',
      text: `แจ้งเตือน: พนักงานมาสาย
      พนักงาน: ${user.name}
      แผนก: ${user.departmentName}
      วันที่: ${format(date, 'dd/MM/yyyy')}
      สาย: ${Math.floor(minutesLate)} นาที
      ${isHalfDayLate ? '⚠️ สายเกิน 4 ชั่วโมง' : ''}`,
    };

    for (const admin of admins) {
      if (admin.lineUserId) {
        try {
          await this.notificationService.sendNotification(
            admin.employeeId,
            admin.lineUserId,
            JSON.stringify(message),
            'check-in',
          );
          console.log(`Notification sent to admin ${admin.employeeId}`);
        } catch (error) {
          console.error(
            `Failed to send notification to admin ${admin.employeeId}:`,
            error,
          );
        }
      }
    }
  }

  private calculateLateMinutes(checkInTime: Date, shiftStart: Date): number {
    return Math.max(0, differenceInMinutes(checkInTime, shiftStart));
  }

  private calculateOvertimeIncrement(minutes: number): number {
    if (minutes < this.OVERTIME_MINIMUM_MINUTES) return 0;
    return (
      Math.floor(minutes / this.OVERTIME_ROUND_TO_MINUTES) *
      this.OVERTIME_ROUND_TO_MINUTES
    );
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

  private async getEffectiveShift(
    employeeId: string,
    date: Date,
  ): Promise<ShiftData> {
    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        employeeId,
        date,
      );
    return shiftData?.effectiveShift || this.getDefaultShift();
  }

  private getDefaultShift(): ShiftData {
    return {
      id: 'default',
      name: 'Default Shift',
      shiftCode: 'DEFAULT',
      startTime: '08:00',
      endTime: '17:00',
      workDays: [1, 2, 3, 4, 5],
    };
  }
}

// services/TimeEntryService.ts
import {
  PrismaClient,
  Prisma,
  TimeEntry,
  Attendance,
  LeaveRequest,
} from '@prisma/client';
import {
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  min,
  subMinutes,
} from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService';
import {
  ApprovedOvertime,
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

export class TimeEntryService {
  // Constants
  private readonly REGULAR_HOURS_PER_SHIFT = 8;
  private readonly OVERTIME_INCREMENT = 30; // 30 minutes increment for overtime
  private readonly LATE_THRESHOLD = 30; // 30 minutes threshold for considering "very late"
  private readonly HALF_DAY_THRESHOLD = 240; // 4 hours (in minutes)
  private readonly OVERTIME_MINIMUM_MINUTES = 30;
  private readonly OVERTIME_ROUND_TO_MINUTES = 30;

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
      // Get checkout windows
      const { earlyCheckoutStart, regularCheckoutEnd } =
        this.getCheckoutWindow(shiftEnd);

      // Check if this is an early checkout
      const isEarly = this.isEarlyCheckout(checkOutTime, shiftEnd);

      // Check for half-day leave
      const hasHalfDayLeave = leaveRequests.some(
        (leave) =>
          leave.status === 'approved' &&
          leave.leaveFormat === 'ลาครึ่งวัน' &&
          isSameDay(new Date(leave.startDate), checkInTime),
      );

      // Calculate actual worked time
      let workedMinutes = differenceInMinutes(checkOutTime, checkInTime);

      // Adjust worked minutes based on checkout timing
      if (isEarly) {
        if (checkOutTime < earlyCheckoutStart) {
          // Very early checkout - use actual minutes
          console.log(
            'Very early checkout detected, using actual minutes worked',
          );
        } else {
          // Within early window - round to nearest shift end
          workedMinutes = differenceInMinutes(shiftEnd, checkInTime);
          console.log('Checkout within early window, rounding to shift end');
        }
      } else if (checkOutTime <= regularCheckoutEnd) {
        // Normal checkout - use shift end time
        workedMinutes = differenceInMinutes(shiftEnd, checkInTime);
        console.log('Normal checkout, using shift duration');
      } else {
        // Late checkout - will be handled by overtime calculation
        workedMinutes = differenceInMinutes(shiftEnd, checkInTime);
        console.log('Late checkout detected, overtime may apply');
      }

      // Convert to hours and round to 2 decimal places
      const actualHours = Math.round((workedMinutes / 60) * 100) / 100;

      // Calculate maximum regular hours based on half-day status
      const maxRegularHours = hasHalfDayLeave
        ? this.REGULAR_HOURS_PER_SHIFT / 2
        : this.REGULAR_HOURS_PER_SHIFT;

      // Determine regular hours (capped at maxRegularHours)
      const regularHours = Math.min(actualHours, maxRegularHours);

      // Calculate overtime for late checkouts
      const overtimeResult =
        checkOutTime > regularCheckoutEnd
          ? this.calculateOvertimeHours(
              checkInTime,
              checkOutTime,
              approvedOvertimeRequest,
            )
          : { hours: 0, metadata: null };

      // Log the calculation details
      console.log('Time calculation details:', {
        isEarlyCheckout: isEarly,
        checkoutTime: format(checkOutTime, 'HH:mm'),
        earlyWindowStart: format(earlyCheckoutStart, 'HH:mm'),
        regularWindowEnd: format(regularCheckoutEnd, 'HH:mm'),
        workedMinutes,
        actualHours,
        regularHours,
        overtimeHours: overtimeResult.hours,
      });

      return {
        regularHours: Math.max(0, regularHours), // Ensure non-negative
        overtimeHours: overtimeResult.hours,
        overtimeMetadata: overtimeResult.metadata,
      };
    } catch (error) {
      console.error('Error calculating working hours:', error);
      return { regularHours: 0, overtimeHours: 0, overtimeMetadata: null };
    }
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

  private calculateOvertimeHours(
    checkInTime: Date,
    checkOutTime: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): { hours: number; metadata: OvertimeMetadataInput | null } {
    if (!approvedOvertimeRequest) {
      return { hours: 0, metadata: null };
    }

    const overtimeStart = this.parseShiftTime(
      approvedOvertimeRequest.startTime,
      approvedOvertimeRequest.date,
    );
    const overtimeEnd = this.parseShiftTime(
      approvedOvertimeRequest.endTime,
      approvedOvertimeRequest.date,
    );

    // Always use the planned overtime end time as maximum
    const effectiveCheckOutTime = min([checkOutTime, overtimeEnd]);

    // For auto check-in cases, use planned start time
    const effectiveCheckInTime =
      checkInTime <= overtimeStart
        ? overtimeStart // Auto check-in case
        : checkInTime; // Manual late check-in case

    const overtimeMinutes = this.calculateOvertimeIncrement(
      differenceInMinutes(effectiveCheckOutTime, effectiveCheckInTime),
    );

    const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;

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

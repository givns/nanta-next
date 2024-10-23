// services/TimeEntryService.ts
import {
  PrismaClient,
  Prisma,
  TimeEntry,
  Attendance,
  LeaveRequest,
} from '@prisma/client';
import {
  differenceInMinutes,
  format,
  isAfter,
  isBefore,
  isSameDay,
} from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService';
import {
  ApprovedOvertime,
  ShiftData,
  WorkHoursCalculation,
} from '@/types/attendance';
import { NotificationService } from './NotificationService';

export class TimeEntryService {
  private readonly REGULAR_HOURS_PER_SHIFT = 8;
  private readonly OVERTIME_INCREMENT = 30; // 30 minutes increment for overtime
  private readonly GRACE_PERIOD = 15; // 15 minutes grace period for rounding
  private readonly LATE_THRESHOLD = 30; // 30 minutes threshold for considering "very late"
  private readonly HALF_DAY_THRESHOLD = 240; // 4 hours (in minutes)
  private readonly EXTREMELY_LATE_THRESHOLD = 240; // 4 hours - prevent check in

  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
    private notificationService: NotificationService,
  ) {}

  async createOrUpdateTimeEntry(
    attendance: Attendance,
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

    // Calculate minutes late
    const checkInTime = attendance.regularCheckInTime || attendance.date;
    const checkOutTime = isCheckIn
      ? null
      : attendance.regularCheckOutTime || new Date();

    const { regularHours, overtimeHours, minutesLate, isHalfDayLate } =
      this.calculateHours(
        checkInTime,
        checkOutTime,
        shiftStart,
        shiftEnd,
        approvedOvertimeRequest,
        leaveRequests,
      );

    // If late without approved leave, notify admin
    if (minutesLate > this.LATE_THRESHOLD && !leaveRequests.length) {
      console.log('Sending late notification to admin:', {
        employeeId: attendance.employeeId,
        minutesLate,
        date: attendance.date,
      });

      try {
        await this.notifyAdminOfLateness(
          attendance.employeeId,
          attendance.date,
          minutesLate,
          false, // We'll set isHalfDayLate based on approved leaves only
        );
      } catch (error) {
        console.error('Failed to send late notification:', error);
      }
    }

    const timeEntryData: Prisma.TimeEntryUncheckedCreateInput = {
      employeeId: attendance.employeeId,
      date: attendance.date,
      startTime: checkInTime,
      endTime: checkOutTime,
      regularHours,
      overtimeHours,
      actualMinutesLate: minutesLate,
      isHalfDayLate: false, // We'll set this based on approved leaves only
      status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
      attendanceId: attendance.id,
      entryType: overtimeHours > 0 ? 'overtime' : 'regular',
    };

    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: { attendanceId: attendance.id },
    });

    if (existingEntry) {
      return this.prisma.timeEntry.update({
        where: { id: existingEntry.id },
        data: timeEntryData,
      });
    } else {
      return this.prisma.timeEntry.create({
        data: timeEntryData,
      });
    }
  }

  private async notifyAdminOfLateness(
    employeeId: string,
    date: Date,
    minutesLate: number,
    isHalfDayLate: boolean,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      select: { name: true, departmentName: true },
    });

    if (!user) return;

    const admins = await this.prisma.user.findMany({
      where: {
        role: { in: ['Admin', 'SuperAdmin'] },
      },
      select: { employeeId: true, lineUserId: true },
    });

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
        await this.notificationService.sendNotification(
          admin.employeeId,
          admin.lineUserId,
          JSON.stringify(message),
          'check-in',
        );
      }
    }
  }

  private calculateHours(
    checkInTime: Date,
    checkOutTime: Date | null,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
    leaveRequests: LeaveRequest[] = [],
  ): {
    regularHours: number;
    overtimeHours: number;
    minutesLate: number;
    isHalfDayLate: boolean;
  } {
    if (!checkOutTime)
      return {
        regularHours: 0,
        overtimeHours: 0,
        minutesLate: 0,
        isHalfDayLate: false,
      };

    // Calculate late minutes but it doesn't affect regular hours unless extremely late
    const minutesLate = Math.max(
      0,
      differenceInMinutes(checkInTime, shiftStart),
    );

    // Check for approved half-day leave
    const hasHalfDayLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'Approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(leave.startDate, checkInTime),
    );

    // isHalfDayLate should only be true if there's an approved half-day leave
    const isHalfDayLate = hasHalfDayLeave;

    // Calculate regular hours based on business rules
    let regularHours = this.REGULAR_HOURS_PER_SHIFT;

    if (hasHalfDayLeave) {
      // If has approved half-day leave, count 4 hours
      regularHours = this.REGULAR_HOURS_PER_SHIFT / 2;
    }

    // Calculate overtime if any
    let overtimeHours = 0;
    if (approvedOvertimeRequest) {
      const overtimeStart = this.parseShiftTime(
        approvedOvertimeRequest.startTime,
        approvedOvertimeRequest.date,
      );
      const overtimeEnd = this.parseShiftTime(
        approvedOvertimeRequest.endTime,
        approvedOvertimeRequest.date,
      );

      if (checkOutTime > overtimeStart) {
        const effectiveOvertimeStart = new Date(
          Math.max(checkInTime.getTime(), overtimeStart.getTime()),
        );
        const effectiveOvertimeEnd = new Date(
          Math.min(checkOutTime.getTime(), overtimeEnd.getTime()),
        );

        const overtimeMinutes = this.calculateOvertimeIncrement(
          differenceInMinutes(effectiveOvertimeEnd, effectiveOvertimeStart),
        );

        overtimeHours = overtimeMinutes / 60;
      }
    }

    return {
      regularHours: Math.round(regularHours * 100) / 100,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      minutesLate,
      isHalfDayLate,
    };
  }

  private calculateOvertimeIncrement(minutes: number): number {
    // Round down to nearest 30-minute increment
    return (
      Math.floor(minutes / this.OVERTIME_INCREMENT) * this.OVERTIME_INCREMENT
    );
  }

  async getTimeEntriesForEmployee(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TimeEntry[]> {
    return this.prisma.timeEntry.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
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
        status: 'COMPLETED',
      },
      include: {
        user: true,
      },
    });
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
    if (!shiftData || !shiftData.effectiveShift) {
      console.warn(
        `No effective shift found for employee ${employeeId} on ${date}`,
      );
      return this.getDefaultShift();
    }
    return shiftData.effectiveShift;
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

  private parseShiftTime(timeString: string, referenceDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const shiftTime = new Date(referenceDate);
    shiftTime.setHours(hours, minutes, 0, 0);
    return shiftTime;
  }
}

// services/TimeEntryService.ts
import {
  PrismaClient,
  Prisma,
  TimeEntry,
  Attendance,
  LeaveRequest,
} from '@prisma/client';
import { differenceInMinutes, format, isSameDay } from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService';
import { ApprovedOvertime, ShiftData } from '@/types/attendance';
import { NotificationService } from './NotificationService';

export class TimeEntryService {
  private readonly REGULAR_HOURS_PER_SHIFT = 8;
  private readonly OVERTIME_INCREMENT = 30; // 30 minutes increment for overtime
  private readonly LATE_THRESHOLD = 30; // 30 minutes threshold for considering "very late"
  private readonly HALF_DAY_THRESHOLD = 240; // 4 hours (in minutes)

  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
    private notificationService: NotificationService,
  ) {}

  private calculateLateMinutes(checkInTime: Date, shiftStart: Date): number {
    return Math.max(0, differenceInMinutes(checkInTime, shiftStart));
  }

  private calculateWorkingHours(
    checkInTime: Date,
    checkOutTime: Date | null,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
    leaveRequests: LeaveRequest[] = [],
  ): {
    regularHours: number;
    overtimeHours: number;
  } {
    if (!checkOutTime) {
      return {
        regularHours: 0,
        overtimeHours: 0,
      };
    }

    // Check for approved half-day leave
    const hasHalfDayLeave = leaveRequests.some(
      (leave) =>
        leave.status === 'Approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(leave.startDate, checkInTime),
    );

    // Calculate regular hours based on business rules
    let regularHours = hasHalfDayLeave
      ? this.REGULAR_HOURS_PER_SHIFT / 2
      : this.REGULAR_HOURS_PER_SHIFT;

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
    };
  }

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

    // Handle check-in specifics
    let minutesLate = 0;
    let isHalfDayLate = false;

    if (isCheckIn && attendance.regularCheckInTime) {
      minutesLate = this.calculateLateMinutes(
        attendance.regularCheckInTime,
        shiftStart,
      );
      isHalfDayLate = minutesLate >= this.HALF_DAY_THRESHOLD;

      // Only notify on check-in if late
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
            isHalfDayLate,
          );
        } catch (error) {
          console.error('Failed to send late notification:', error);
        }
      }
    }

    // Calculate hours only on check-out
    const { regularHours, overtimeHours } = isCheckIn
      ? { regularHours: 0, overtimeHours: 0 }
      : this.calculateWorkingHours(
          attendance.regularCheckInTime!,
          attendance.regularCheckOutTime,
          shiftStart,
          shiftEnd,
          approvedOvertimeRequest,
          leaveRequests,
        );

    // Preserve existing late minutes if updating on check-out
    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: { attendanceId: attendance.id },
    });

    // Handle time entries, ensuring we only include times that exist
    const timeEntryData: Prisma.TimeEntryUncheckedCreateInput = {
      employeeId: attendance.employeeId,
      date: attendance.date,
      // Ensure startTime and endTime are handled correctly
      startTime: attendance.regularCheckInTime || attendance.date,
      endTime: attendance.regularCheckOutTime || null,
      regularHours: regularHours || 0,
      overtimeHours: overtimeHours || 0,
      actualMinutesLate: isCheckIn
        ? minutesLate
        : (existingEntry?.actualMinutesLate ?? 0),
      isHalfDayLate: isCheckIn
        ? isHalfDayLate
        : (existingEntry?.isHalfDayLate ?? false),
      status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
      attendanceId: attendance.id,
      // Ensure entryType is never null
      entryType: overtimeHours > 0 ? 'overtime' : 'regular',
    };

    // Only add times if they exist
    if (attendance.regularCheckInTime) {
      timeEntryData.startTime = attendance.regularCheckInTime;
    }
    if (attendance.regularCheckOutTime) {
      timeEntryData.endTime = attendance.regularCheckOutTime;
    }

    if (existingEntry) {
      return this.prisma.timeEntry.update({
        where: { id: existingEntry.id },
        data: timeEntryData as Prisma.TimeEntryUncheckedCreateInput,
      });
    } else {
      return this.prisma.timeEntry.create({
        data: timeEntryData as Prisma.TimeEntryUncheckedCreateInput,
      });
    }
  }

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

  private calculateOvertimeIncrement(minutes: number): number {
    // Round down to nearest 30-minute increment
    return (
      Math.floor(minutes / this.OVERTIME_INCREMENT) * this.OVERTIME_INCREMENT
    );
  }

  // In TimeEntryService.ts
  async getTimeEntriesForEmployee(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<TimeEntry[]> {
    try {
      // Get entries with basic where clause
      const entries = await this.prisma.timeEntry.findMany({
        where: {
          employeeId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Map entries to ensure entryType is never null
      return entries.map((entry) => ({
        ...entry,
        entryType: entry.entryType || 'regular', // Provide default value
      }));
    } catch (error) {
      console.error('Error fetching time entries:', error);
      return []; // Return empty array instead of throwing error
    }
  }

  async getTimeEntriesForPayroll(
    startDate: Date,
    endDate: Date,
  ): Promise<TimeEntry[]> {
    const entries = await this.prisma.timeEntry.findMany({
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

    // Ensure valid entryType for payroll entries
    return entries.map((entry) => ({
      ...entry,
      entryType: entry.entryType || 'regular',
    }));
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

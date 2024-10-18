// services/TimeEntryService.ts
import {
  PrismaClient,
  TimeEntry,
  Attendance,
  OvertimeRequest,
} from '@prisma/client';
import { differenceInMinutes, isAfter, isBefore } from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService';
import { ApprovedOvertime, ShiftData } from '@/types/attendance';

export class TimeEntryService {
  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
  ) {}

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

  async createOrUpdateTimeEntry(
    attendance: Attendance,
    isCheckIn: boolean,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): Promise<TimeEntry> {
    const effectiveShift = await this.getEffectiveShift(
      attendance.employeeId,
      attendance.date,
    );
    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: { employeeId: attendance.employeeId, date: attendance.date },
    });

    const shiftStart = this.parseShiftTime(
      effectiveShift.startTime,
      attendance.date,
    );
    const shiftEnd = this.parseShiftTime(
      effectiveShift.endTime,
      attendance.date,
    );
    const checkInTime = attendance.checkInTime || attendance.date;
    const checkOutTime = isCheckIn
      ? null
      : attendance.checkOutTime || new Date();

    const { regularHours, overtimeHours } = this.calculateHours(
      checkInTime,
      checkOutTime,
      shiftStart,
      shiftEnd,
      approvedOvertimeRequest,
    );

    const timeEntryData = {
      employeeId: attendance.employeeId,
      date: attendance.date,
      startTime: checkInTime,
      endTime: checkOutTime,
      regularHours,
      overtimeHours,
      status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
      attendanceId: attendance.id,
    };

    if (existingEntry) {
      return this.prisma.timeEntry.update({
        where: { id: existingEntry.id },
        data: timeEntryData,
      });
    } else {
      return this.prisma.timeEntry.create({ data: timeEntryData });
    }
  }

  private calculateHours(
    checkInTime: Date,
    checkOutTime: Date | null,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): { regularHours: number; overtimeHours: number } {
    if (!checkOutTime) return { regularHours: 0, overtimeHours: 0 };

    let regularHours = 0;
    let overtimeHours = 0;

    // Calculate total worked hours
    const totalWorkedMinutes = differenceInMinutes(checkOutTime, checkInTime);

    // Calculate regular hours (capped at shift duration)
    const shiftDurationMinutes = differenceInMinutes(shiftEnd, shiftStart);
    regularHours = Math.min(totalWorkedMinutes, shiftDurationMinutes) / 60;

    // Calculate overtime
    if (approvedOvertimeRequest) {
      const overtimeStart = this.parseShiftTime(
        approvedOvertimeRequest.startTime,
        approvedOvertimeRequest.date,
      );
      const overtimeEnd = this.parseShiftTime(
        approvedOvertimeRequest.endTime,
        approvedOvertimeRequest.date,
      );
      const approvedOvertimeMinutes = differenceInMinutes(
        overtimeEnd,
        overtimeStart,
      );

      // Overtime is the minimum of approved overtime and actual overtime worked
      overtimeHours =
        Math.min(
          approvedOvertimeMinutes,
          Math.max(0, totalWorkedMinutes - shiftDurationMinutes),
        ) / 60;
    } else {
      // If no approved overtime, any time beyond shift end is considered overtime
      overtimeHours =
        Math.max(0, totalWorkedMinutes - shiftDurationMinutes) / 60;
    }

    return { regularHours, overtimeHours };
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

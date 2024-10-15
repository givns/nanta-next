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

  private calculateRegularHours(
    checkInTime: Date,
    checkOutTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): number {
    const effectiveStart = isAfter(checkInTime, shiftStart)
      ? checkInTime
      : shiftStart;
    const effectiveEnd = isBefore(checkOutTime, shiftEnd)
      ? checkOutTime
      : shiftEnd;
    return Math.max(0, differenceInMinutes(effectiveEnd, effectiveStart) / 60);
  }

  private calculateOvertimeHours(
    checkInTime: Date,
    checkOutTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): number {
    const beforeShiftMinutes = Math.max(
      0,
      differenceInMinutes(shiftStart, checkInTime),
    );
    const afterShiftMinutes = Math.max(
      0,
      differenceInMinutes(checkOutTime, shiftEnd),
    );
    const totalOvertimeMinutes = beforeShiftMinutes + afterShiftMinutes;
    return Math.floor(totalOvertimeMinutes / 30) * 0.5;
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

  async createPendingOvertimeEntry(
    overtimeRequest: OvertimeRequest,
  ): Promise<TimeEntry> {
    const startTime = new Date(
      `${overtimeRequest.date.toISOString().split('T')[0]}T${overtimeRequest.startTime}`,
    );
    const endTime = new Date(
      `${overtimeRequest.date.toISOString().split('T')[0]}T${overtimeRequest.endTime}`,
    );

    return this.prisma.timeEntry.create({
      data: {
        employeeId: overtimeRequest.employeeId,
        date: overtimeRequest.date,
        startTime,
        endTime,
        status: 'PENDING',
        regularHours: 0,
        overtimeHours: differenceInMinutes(endTime, startTime) / 60,
        overtimeRequestId: overtimeRequest.id,
      },
    });
  }

  async finalizePendingOvertimeEntry(
    approvedOvertime: ApprovedOvertime,
  ): Promise<void> {
    const timeEntry = await this.prisma.timeEntry.findFirst({
      where: { overtimeRequestId: approvedOvertime.id },
    });

    if (!timeEntry) {
      throw new Error('No pending time entry found for this overtime request');
    }

    const effectiveShift = await this.getEffectiveShift(
      approvedOvertime.employeeId,
      approvedOvertime.date,
    );
    const shiftStart = this.parseShiftTime(
      effectiveShift.startTime,
      approvedOvertime.date,
    );
    const shiftEnd = this.parseShiftTime(
      effectiveShift.endTime,
      approvedOvertime.date,
    );

    const overtimeStart = new Date(
      `${approvedOvertime.date.toISOString().split('T')[0]}T${approvedOvertime.startTime}`,
    );
    const overtimeEnd = new Date(
      `${approvedOvertime.date.toISOString().split('T')[0]}T${approvedOvertime.endTime}`,
    );

    const { regularHours, overtimeHours } = this.calculateHours(
      timeEntry.startTime || overtimeStart,
      timeEntry.endTime || overtimeEnd,
      shiftStart,
      shiftEnd,
      approvedOvertime,
    );

    await this.prisma.timeEntry.update({
      where: { id: timeEntry.id },
      data: {
        status: 'APPROVED',
        regularHours,
        overtimeHours,
        startTime: timeEntry.startTime || overtimeStart,
        endTime: timeEntry.endTime || overtimeEnd,
      },
    });
  }

  async deletePendingOvertimeEntry(overtimeRequestId: string): Promise<void> {
    const timeEntry = await this.prisma.timeEntry.findFirst({
      where: { overtimeRequestId },
    });

    if (!timeEntry) {
      console.warn(
        `No time entry found for overtime request ${overtimeRequestId}`,
      );
      return;
    }

    if (timeEntry.attendanceId) {
      // If there's an associated attendance, update the time entry to remove overtime
      const effectiveShift = await this.getEffectiveShift(
        timeEntry.employeeId,
        timeEntry.date,
      );
      const shiftStart = this.parseShiftTime(
        effectiveShift.startTime,
        timeEntry.date,
      );
      const shiftEnd = this.parseShiftTime(
        effectiveShift.endTime,
        timeEntry.date,
      );

      const regularHours = this.calculateRegularHours(
        timeEntry.startTime,
        timeEntry.endTime || new Date(),
        shiftStart,
        shiftEnd,
      );

      await this.prisma.timeEntry.update({
        where: { id: timeEntry.id },
        data: {
          overtimeRequestId: null,
          overtimeHours: 0,
          regularHours,
          status: 'COMPLETED',
        },
      });
    } else {
      // If it's a standalone overtime entry, delete it
      await this.prisma.timeEntry.delete({
        where: { id: timeEntry.id },
      });
    }
  }

  async createOrUpdateTimeEntry(
    attendance: Attendance,
    isCheckIn: boolean,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): Promise<TimeEntry> {
    try {
      console.log(
        `Starting createOrUpdateTimeEntry for employee ${attendance.employeeId}`,
      );

      const effectiveShift = await this.getEffectiveShift(
        attendance.employeeId,
        attendance.date,
      );
      console.log('Effective shift:', JSON.stringify(effectiveShift));

      const existingEntry = await this.prisma.timeEntry.findFirst({
        where: { employeeId: attendance.employeeId, date: attendance.date },
      });

      if (existingEntry) {
        return this.updateTimeEntry(
          existingEntry.id,
          attendance,
          effectiveShift,
          isCheckIn,
          approvedOvertimeRequest,
        );
      } else {
        return this.createTimeEntry(
          attendance,
          effectiveShift,
          isCheckIn,
          approvedOvertimeRequest,
        );
      }
    } catch (error) {
      console.error('Error in createOrUpdateTimeEntry:', error);
      throw error;
    }
  }

  private async createTimeEntry(
    attendance: Attendance,
    effectiveShift: ShiftData,
    isCheckIn: boolean,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): Promise<TimeEntry> {
    const checkInTime = attendance.checkInTime || attendance.date;
    const checkOutTime = isCheckIn
      ? null
      : attendance.checkOutTime || new Date();
    const shiftStart = this.parseShiftTime(
      effectiveShift.startTime,
      checkInTime,
    );
    const shiftEnd = this.parseShiftTime(effectiveShift.endTime, checkInTime);

    const { regularHours, overtimeHours } = this.calculateHours(
      checkInTime,
      checkOutTime || new Date(),
      shiftStart,
      shiftEnd,
      approvedOvertimeRequest,
    );

    return this.prisma.timeEntry.create({
      data: {
        employeeId: attendance.employeeId,
        date: attendance.date,
        startTime: checkInTime,
        endTime: checkOutTime,
        status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
        regularHours,
        overtimeHours,
        attendanceId: attendance.id,
        overtimeRequestId: approvedOvertimeRequest?.id,
      },
    });
  }

  private async updateTimeEntry(
    timeEntryId: string,
    attendance: Attendance,
    effectiveShift: ShiftData,
    isCheckIn: boolean,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): Promise<TimeEntry> {
    const checkOutTime = isCheckIn
      ? null
      : attendance.checkOutTime || new Date();
    const shiftStart = this.parseShiftTime(
      effectiveShift.startTime,
      attendance.date,
    );
    const shiftEnd = this.parseShiftTime(
      effectiveShift.endTime,
      attendance.date,
    );

    const { regularHours, overtimeHours } = this.calculateHours(
      attendance.checkInTime!,
      checkOutTime || new Date(),
      shiftStart,
      shiftEnd,
      approvedOvertimeRequest,
    );

    return this.prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        endTime: checkOutTime,
        status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
        regularHours,
        overtimeHours,
        overtimeRequestId: approvedOvertimeRequest?.id,
      },
    });
  }

  private calculateHours(
    checkInTime: Date,
    checkOutTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): { regularHours: number; overtimeHours: number } {
    let regularHours = 0;
    let overtimeHours = 0;

    // Calculate regular hours
    const effectiveStart = Math.max(
      checkInTime.getTime(),
      shiftStart.getTime(),
    );
    const effectiveEnd = Math.min(checkOutTime.getTime(), shiftEnd.getTime());
    regularHours = Math.max(
      0,
      (effectiveEnd - effectiveStart) / (60 * 60 * 1000),
    );

    // Calculate overtime hours
    if (approvedOvertimeRequest) {
      const overtimeStart = new Date(
        `${approvedOvertimeRequest.date.toISOString().split('T')[0]}T${approvedOvertimeRequest.startTime}`,
      );
      const overtimeEnd = new Date(
        `${approvedOvertimeRequest.date.toISOString().split('T')[0]}T${approvedOvertimeRequest.endTime}`,
      );

      const overtimeEffectiveStart = Math.max(
        checkInTime.getTime(),
        overtimeStart.getTime(),
      );
      const overtimeEffectiveEnd = Math.min(
        checkOutTime.getTime(),
        overtimeEnd.getTime(),
      );
      overtimeHours = Math.max(
        0,
        (overtimeEffectiveEnd - overtimeEffectiveStart) / (60 * 60 * 1000),
      );
    } else if (checkOutTime > shiftEnd) {
      overtimeHours =
        (checkOutTime.getTime() - shiftEnd.getTime()) / (60 * 60 * 1000);
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

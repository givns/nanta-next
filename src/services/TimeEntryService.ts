// services/TimeEntryService.ts
import {
  PrismaClient,
  TimeEntry,
  Attendance,
  OvertimeRequest,
} from '@prisma/client';
import { differenceInMinutes, isAfter, isBefore } from 'date-fns';
import { ShiftManagementService } from './ShiftManagementService';
import { ShiftData } from '@/types/attendance';

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
    return this.prisma.timeEntry.create({
      data: {
        employeeId: overtimeRequest.employeeId,
        date: overtimeRequest.date,
        startTime: new Date(
          `${overtimeRequest.date.toISOString().split('T')[0]}T${overtimeRequest.startTime}`,
        ),
        endTime: new Date(
          `${overtimeRequest.date.toISOString().split('T')[0]}T${overtimeRequest.endTime}`,
        ),
        status: 'PENDING',
        regularHours: 0,
        overtimeHours: 0,
        overtimeRequestId: overtimeRequest.id,
      },
    });
  }

  async createOrUpdateTimeEntry(attendance: Attendance): Promise<TimeEntry> {
    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      attendance.employeeId,
      attendance.date,
    );

    if (!effectiveShift) {
      throw new Error('No effective shift found for the employee on this date');
    }

    const existingEntry = await this.prisma.timeEntry.findFirst({
      where: { employeeId: attendance.employeeId, date: attendance.date },
    });

    if (existingEntry) {
      return this.updateTimeEntry(existingEntry.id, attendance, effectiveShift);
    } else {
      return this.createTimeEntry(attendance, effectiveShift);
    }
  }

  private async createTimeEntry(
    attendance: Attendance,
    effectiveShift: ShiftData,
  ): Promise<TimeEntry> {
    const checkInTime = attendance.checkInTime || attendance.date;
    const checkOutTime = attendance.checkOutTime || new Date();
    const shiftStart = effectiveShift
      ? this.parseShiftTime(effectiveShift.startTime, checkInTime)
      : null;
    const shiftEnd = effectiveShift
      ? this.parseShiftTime(effectiveShift.endTime, checkInTime)
      : null;

    const regularHours = this.calculateRegularHours(
      checkInTime,
      checkOutTime,
      shiftStart || new Date(), // Provide a default value of new Date() when shiftStart is null
      shiftEnd || new Date(), // Provide a default value of new Date() when shiftEnd is null
    );
    const overtimeHours = this.calculateOvertimeHours(
      checkInTime,
      checkOutTime,
      shiftStart || new Date(), // Provide a default value of new Date() when shiftStart is null
      shiftEnd || new Date(), // Provide a default value of new Date() when shiftEnd is null
    );

    return this.prisma.timeEntry.create({
      data: {
        employeeId: attendance.employeeId,
        date: attendance.date,
        startTime: checkInTime,
        endTime: checkOutTime,
        status: 'COMPLETED',
        regularHours,
        overtimeHours,
        attendanceId: attendance.id,
      },
    });
  }

  private async updateTimeEntry(
    timeEntryId: string,
    attendance: Attendance,
    effectiveShift: ShiftData,
  ): Promise<TimeEntry> {
    const checkOutTime = attendance.checkOutTime || new Date();
    const shiftStart = effectiveShift
      ? this.parseShiftTime(effectiveShift.startTime, attendance.date)
      : null;
    const shiftEnd = effectiveShift
      ? this.parseShiftTime(effectiveShift.endTime, attendance.date)
      : null;

    const regularHours = this.calculateRegularHours(
      attendance.checkInTime!,
      checkOutTime,
      shiftStart || new Date(), // Provide a default value of new Date() when shiftStart is null
      shiftEnd || new Date(), // Provide a default value of new Date() when shiftEnd is null
    );
    const overtimeHours = this.calculateOvertimeHours(
      attendance.checkInTime!,
      checkOutTime,
      shiftStart || new Date(), // Provide a default value of new Date() when shiftStart is null
      shiftEnd || new Date(), // Provide a default value of new Date() when shiftEnd is null
    );

    return this.prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        endTime: checkOutTime,
        status: 'COMPLETED',
        regularHours,
        overtimeHours,
      },
    });
  }

  private parseShiftTime(timeString: string, referenceDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const shiftTime = new Date(referenceDate);
    shiftTime.setHours(hours, minutes, 0, 0);
    return shiftTime;
  }
}

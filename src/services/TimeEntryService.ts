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

  async createOrUpdateTimeEntry(
    attendance: Attendance,
    isCheckIn: boolean,
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
        );
      } else {
        return this.createTimeEntry(attendance, effectiveShift, isCheckIn);
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

    const regularHours = isCheckIn
      ? 0
      : this.calculateRegularHours(
          checkInTime,
          checkOutTime || new Date(),
          shiftStart,
          shiftEnd,
        );
    const overtimeHours = isCheckIn
      ? 0
      : this.calculateOvertimeHours(
          checkInTime,
          checkOutTime || new Date(),
          shiftStart,
          shiftEnd,
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
      },
    });
  }

  private async updateTimeEntry(
    timeEntryId: string,
    attendance: Attendance,
    effectiveShift: ShiftData,
    isCheckIn: boolean,
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

    const regularHours = isCheckIn
      ? 0
      : this.calculateRegularHours(
          attendance.checkInTime!,
          checkOutTime || new Date(),
          shiftStart,
          shiftEnd,
        );
    const overtimeHours = isCheckIn
      ? 0
      : this.calculateOvertimeHours(
          attendance.checkInTime!,
          checkOutTime || new Date(),
          shiftStart,
          shiftEnd,
        );

    return this.prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        endTime: checkOutTime,
        status: isCheckIn ? 'IN_PROGRESS' : 'COMPLETED',
        regularHours,
        overtimeHours,
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

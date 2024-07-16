// services/TimeEntryService.ts

import {
  PrismaClient,
  TimeEntry,
  OvertimeRequest,
  Attendance,
} from '@prisma/client';

const prisma = new PrismaClient();

export class TimeEntryService {
  async createPendingOvertimeEntry(
    overtimeRequest: OvertimeRequest,
  ): Promise<TimeEntry> {
    return prisma.timeEntry.create({
      data: {
        userId: overtimeRequest.userId,
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
    const existingEntry = await prisma.timeEntry.findFirst({
      where: { userId: attendance.userId, date: attendance.date },
    });

    if (existingEntry) {
      return this.updateTimeEntry(existingEntry.id, attendance);
    } else {
      return this.createTimeEntry(attendance);
    }
  }

  private async createTimeEntry(attendance: Attendance): Promise<TimeEntry> {
    const startTime = attendance.checkInTime || attendance.date; // Use date as fallback
    const endTime = attendance.checkOutTime || new Date();

    return prisma.timeEntry.create({
      data: {
        userId: attendance.userId,
        date: attendance.date,
        startTime: startTime,
        endTime: endTime,
        status: 'COMPLETED',
        regularHours: 1, // Calculate this based on your business logic
        overtimeHours: 1.5, // Calculate this based on your business logic
        attendanceId: attendance.id,
      },
    });
  }

  private async updateTimeEntry(
    timeEntryId: string,
    attendance: Attendance,
  ): Promise<TimeEntry> {
    const endTime = attendance.checkOutTime || new Date();

    return prisma.timeEntry.update({
      where: { id: timeEntryId },
      data: {
        endTime: endTime,
        status: 'COMPLETED',
        // Update regularHours and overtimeHours based on your business logic
      },
    });
  }

  async getTimeEntriesForPayroll(
    startDate: Date,
    endDate: Date,
  ): Promise<TimeEntry[]> {
    return prisma.timeEntry.findMany({
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
}

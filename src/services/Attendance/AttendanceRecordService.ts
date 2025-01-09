import { AttendanceRecord } from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { PeriodType, PrismaClient } from '@prisma/client';
import { endOfDay, startOfDay } from 'date-fns';
import { AttendanceMappers } from './utils/AttendanceMappers';

interface GetAttendanceRecordOptions {
  periodType?: PeriodType;
}

export class AttendanceRecordService {
  constructor(private readonly prisma: PrismaClient) {}

  async getLatestAttendanceRecord(
    employeeId: string,
    options?: GetAttendanceRecordOptions,
  ): Promise<AttendanceRecord | null> {
    const now = getCurrentTime();

    const record = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(now),
          lt: endOfDay(now),
        },
        ...(options?.periodType && { type: options.periodType }),
      },
      include: {
        timeEntries: {
          include: {
            overtimeMetadata: true,
          },
        },
        overtimeEntries: true,
        checkTiming: true,
        location: true,
        metadata: true,
      },
      orderBy: [
        // Order by createdAt desc to get the latest record
        { createdAt: 'desc' },
        // Secondary ordering by periodSequence desc
        { periodSequence: 'desc' },
        // Final fallback to ID
        { id: 'desc' },
      ],
    });

    return record ? AttendanceMappers.toAttendanceRecord(record) : null;
  }

  // AttendanceRecordService.ts
  async getAllAttendanceRecords(
    employeeId: string,
    options?: GetAttendanceRecordOptions,
  ): Promise<AttendanceRecord[]> {
    const now = getCurrentTime();

    const records = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfDay(now),
          lt: endOfDay(now),
        },
        ...(options?.periodType && { type: options.periodType }),
      },
      include: {
        timeEntries: {
          include: {
            overtimeMetadata: true,
          },
        },
        overtimeEntries: true,
        checkTiming: true,
        location: true,
        metadata: true,
      },
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    });

    // Filter out null values after mapping
    return records
      .map((record) => AttendanceMappers.toAttendanceRecord(record))
      .filter((record): record is AttendanceRecord => record !== null);
  }
}

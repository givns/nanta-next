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

    // Log before Prisma query
    console.log('Getting records for:', {
      employeeId,
      options,
      now: now.toISOString(),
    });

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

    // Log raw records from Prisma
    console.log(
      'Raw records from Prisma:',
      records.map((r) => ({
        id: r.id,
        type: r.type,
        rawTimes: {
          checkIn: r.CheckInTime,
          checkOut: r.CheckOutTime,
        },
      })),
    );

    // Map records one by one to catch any issues
    const mappedRecords = records
      .map((record) => {
        const mapped = AttendanceMappers.toAttendanceRecord(record);

        // Log each mapped record
        console.log('Mapped record:', {
          id: record.id,
          type: record.type,
          beforeMapping: {
            checkIn: record.CheckInTime,
            checkOut: record.CheckOutTime,
            checkInType: typeof record.CheckInTime,
            checkOutType: typeof record.CheckOutTime,
          },
          afterMapping: {
            checkIn: mapped?.CheckInTime,
            checkOut: mapped?.CheckOutTime,
            checkInType: mapped?.CheckInTime ? typeof mapped.CheckInTime : null,
            checkOutType: mapped?.CheckOutTime
              ? typeof mapped.CheckOutTime
              : null,
            checkInIsDate: mapped?.CheckInTime instanceof Date,
            checkOutIsDate: mapped?.CheckOutTime instanceof Date,
          },
        });

        return mapped;
      })
      .filter((record): record is AttendanceRecord => record !== null);

    // Log final records
    console.log(
      'Final records:',
      mappedRecords.map((r) => ({
        id: r.id,
        type: r.type,
        times: {
          checkIn: r.CheckInTime,
          checkOut: r.CheckOutTime,
          checkInType: typeof r.CheckInTime,
          checkInIsDate: r.CheckInTime instanceof Date,
          checkOutType: typeof r.CheckOutTime,
          checkOutIsDate: r.CheckOutTime instanceof Date,
        },
      })),
    );

    return mappedRecords;
  }
}

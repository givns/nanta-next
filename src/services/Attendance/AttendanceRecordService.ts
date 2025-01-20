import { AttendanceRecord } from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { PeriodType, PrismaClient } from '@prisma/client';
import { endOfDay, startOfDay, subDays } from 'date-fns';
import { AttendanceMappers } from './utils/AttendanceMappers';

interface GetAttendanceRecordOptions {
  periodType?: PeriodType;
}

export class AttendanceRecordService {
  constructor(private readonly prisma: PrismaClient) {}

  async getLatestAttendanceRecord(
    employeeId: string,
    options?: { periodType?: PeriodType },
  ): Promise<AttendanceRecord | null> {
    const records = await this.getAllAttendanceRecords(employeeId, options);

    // First try to find an active (unchecked-out) record
    const activeRecord = records?.find(
      (record) => record.CheckInTime && !record.CheckOutTime,
    );
    if (activeRecord) return activeRecord;

    return records && records[0]
      ? AttendanceMappers.toAttendanceRecord(records)
      : null;
  }

  async getAllAttendanceRecords(
    employeeId: string,
    options?: GetAttendanceRecordOptions,
  ): Promise<AttendanceRecord[] | null> {
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
        OR: [
          // Records that start today
          {
            date: {
              gte: startOfDay(subDays(now, 1)), // Look back one day
              lt: endOfDay(now),
            },
          },
          // Overtime records spanning midnight
          {
            type: PeriodType.OVERTIME,
            CheckInTime: {
              lt: endOfDay(now),
            },
            OR: [
              // No check-out time (still active)
              { CheckOutTime: null },
              // Check-out time is after today's start
              {
                CheckOutTime: {
                  gt: startOfDay(now),
                },
              },
            ],
          },
        ],
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
        { CheckInTime: 'desc' }, // Order by check-in time descending
        { id: 'desc' },
      ],
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

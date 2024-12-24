import { AttendanceRecord } from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { PrismaClient } from '@prisma/client';
import { endOfDay, startOfDay } from 'date-fns';
import { AttendanceMappers } from './utils/AttendanceMappers';

export class AttendanceRecordService {
  constructor(private readonly prisma: PrismaClient) {}

  async getLatestAttendanceRecord(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    const now = getCurrentTime();

    const record = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(now),
          lt: endOfDay(now),
        },
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
    });

    return record ? AttendanceMappers.toAttendanceRecord(record) : null;
  }
}

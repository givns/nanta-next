import { PrismaClient, Prisma } from '@prisma/client';
import { StatusUpdateResult, ProcessingOptions } from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';

export class AttendanceLoggingService {
  constructor(private readonly prisma: PrismaClient) {}

  async createAttendanceLog(
    statusUpdate: StatusUpdateResult,
    options: ProcessingOptions,
    attendanceId: string,
  ): Promise<void> {
    try {
      // Convert metadata to Prisma.JsonValue
      const metadataValue: Prisma.JsonValue = statusUpdate.metadata
        ? JSON.parse(JSON.stringify(statusUpdate.metadata))
        : null;

      await this.prisma.attendanceLogs.create({
        data: {
          employeeId: options.employeeId,
          previousState: statusUpdate.stateChange.state.previous,
          currentState: statusUpdate.stateChange.state.current,
          previousCheckStatus: statusUpdate.stateChange.checkStatus.previous,
          currentCheckStatus: statusUpdate.stateChange.checkStatus.current,
          previousOvertimeState:
            statusUpdate.stateChange.overtime?.previous?.state,
          currentOvertimeState:
            statusUpdate.stateChange.overtime?.current?.state,
          isOvertimeTransition: !!statusUpdate.stateChange.overtime,
          reason: statusUpdate.reason,
          metadata: metadataValue,
          timestamp: getCurrentTime(),
          date: new Date(options.checkTime),
          attendance: {
            connect: {
              id: attendanceId,
            },
          },
        },
      });
    } catch (error) {
      console.error('Failed to create attendance log:', {
        error,
        employeeId: options.employeeId,
        attendanceId,
        timestamp: getCurrentTime(),
      });
    }
  }
}

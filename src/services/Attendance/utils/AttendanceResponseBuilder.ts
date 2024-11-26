// services/Attendance/utils/AttendanceResponseBuilder.ts

import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  ErrorResponse,
  AttendanceRecord,
  TimeEntry,
  ProcessedAttendance,
  ProcessingResult,
} from '../../../types/attendance';

export class AttendanceResponseBuilder {
  static createProcessingResponse(
    attendance: AttendanceRecord,
    timeEntries: { regular?: TimeEntry; overtime?: TimeEntry[] },
    overtimeContext?: {
      isOvertime: boolean;
      metadata?: Record<string, unknown>;
    },
  ): ProcessingResult {
    const processedAttendance: ProcessedAttendance = {
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: attendance.date,
      state: attendance.state,
      checkStatus: attendance.checkStatus,
      regularHours: timeEntries.regular?.regularHours || 0,
      overtimeHours:
        timeEntries.overtime?.reduce(
          (sum, entry) => sum + entry.overtimeHours,
          0,
        ) || 0,
      regularCheckInTime: attendance.regularCheckInTime,
      regularCheckOutTime: attendance.regularCheckOutTime,
      detailedStatus: this.buildDetailedStatus(attendance),
    };

    if (overtimeContext?.isOvertime) {
      processedAttendance.overtime = {
        isDayOffOvertime:
          attendance.overtimeEntries[0]?.isDayOffOvertime || false,
        isInsideShiftHours:
          attendance.overtimeEntries[0]?.isInsideShiftHours || false,
        startTime:
          attendance.overtimeEntries[0]?.actualStartTime?.toISOString() || '',
        endTime:
          attendance.overtimeEntries[0]?.actualEndTime?.toISOString() || '',
        actualStartTime:
          attendance.overtimeEntries[0]?.actualStartTime || new Date(),
        actualEndTime:
          attendance.overtimeEntries[0]?.actualEndTime || new Date(),
        state: attendance.overtimeState || OvertimeState.NOT_STARTED,
      };
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: processedAttendance,
      metadata: overtimeContext?.metadata,
    };
  }

  static createErrorResponse(
    error: Error,
    code: string = 'PROCESSING_ERROR',
  ): ErrorResponse {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: {
        code,
        message: error.message,
        details:
          error instanceof Error
            ? {
                name: error.name,
                stack:
                  process.env.NODE_ENV === 'development'
                    ? error.stack
                    : undefined,
              }
            : undefined,
      },
    };
  }

  private static buildDetailedStatus(attendance: AttendanceRecord): string {
    const statusParts: string[] = [];

    if (attendance.state === AttendanceState.HOLIDAY) return 'holiday';
    if (attendance.state === AttendanceState.OFF) return 'off';

    if (attendance.isLateCheckIn) statusParts.push('late-check-in');
    if (attendance.isEarlyCheckIn) statusParts.push('early-check-in');
    if (attendance.isLateCheckOut) statusParts.push('late-check-out');
    if (attendance.overtimeEntries.length > 0) statusParts.push('overtime');

    return statusParts.length > 0 ? statusParts.join('-') : 'on-time';
  }

  private static mapStatusToType(attendance: AttendanceRecord) {
    if (!attendance.regularCheckInTime) {
      return CheckStatus.PENDING;
    }

    if (!attendance.regularCheckOutTime) {
      return attendance.isOvertime
        ? CheckStatus.CHECKED_IN
        : CheckStatus.CHECKED_IN;
    }

    return attendance.isOvertime
      ? OvertimeState.COMPLETED
      : CheckStatus.CHECKED_OUT;
  }
}

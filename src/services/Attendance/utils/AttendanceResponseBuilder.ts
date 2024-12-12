import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  ErrorResponse,
  AttendanceRecord,
  TimeEntry,
  ProcessedAttendance,
  ProcessingResult,
  TimeEntryStatus,
  PeriodType,
  ProcessingContext,
} from '../../../types/attendance';

export class AttendanceResponseBuilder {
  static createProcessingResponse(
    attendance: AttendanceRecord,
    timeEntries: {
      regular?: TimeEntry;
      overtime?: TimeEntry[];
    },
    context?: ProcessingContext,
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
      CheckInTime: attendance.CheckInTime,
      CheckOutTime: attendance.CheckOutTime,
      detailedStatus: this.buildDetailedStatus(attendance),
    };

    // Add overtime data if present
    if (context?.isOvertime || attendance.isOvertime) {
      const overtimeEntry = attendance.overtimeEntries[0];
      processedAttendance.overtime = {
        isDayOffOvertime: overtimeEntry?.isDayOffOvertime || false,
        isInsideShiftHours: overtimeEntry?.isInsideShiftHours || false,
        startTime: overtimeEntry?.actualStartTime?.toISOString() || '',
        endTime: overtimeEntry?.actualEndTime?.toISOString() || '',
        actualStartTime: overtimeEntry?.actualStartTime || new Date(),
        actualEndTime: overtimeEntry?.actualEndTime || new Date(),
        state: attendance.overtimeState || OvertimeState.NOT_STARTED,
      };
    }

    // Enhance metadata with processing information
    const enhancedMetadata = {
      ...(context?.metadata || {}),
      processedAt: new Date().toISOString(),
      isOvertime: context?.isOvertime || false,
    };

    if (context?.metadata?.autoCompleted) {
      enhancedMetadata.autoCompletedEntries = {
        regular: timeEntries.regular
          ? {
              ...timeEntries.regular,
              status: TimeEntryStatus.COMPLETED,
              entryType: PeriodType.REGULAR,
            }
          : undefined,
        overtime: timeEntries.overtime?.map((entry) => ({
          ...entry,
          status: TimeEntryStatus.COMPLETED,
          entryType: PeriodType.OVERTIME,
        })),
      };
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      data: processedAttendance,
      metadata: enhancedMetadata,
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
    if (!attendance.CheckInTime) {
      return CheckStatus.PENDING;
    }

    if (!attendance.CheckOutTime) {
      return attendance.isOvertime
        ? CheckStatus.CHECKED_IN
        : CheckStatus.CHECKED_IN;
    }

    return attendance.isOvertime
      ? OvertimeState.COMPLETED
      : CheckStatus.CHECKED_OUT;
  }
}

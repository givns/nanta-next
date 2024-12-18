// services/Attendance/utils/AttendanceMappers.ts

import { UserData } from '../../../types/user';
import {
  AttendanceCompositeStatus,
  AttendanceRecord,
  TimeEntry,
  OvertimeEntry,
  PeriodType,
  TimeEntryStatus,
  LatestAttendanceResponse,
} from '../../../types/attendance';
import { AttendanceNormalizers } from './AttendanceNormalizers';
import { format } from 'date-fns';
import { AttendanceState, CheckStatus, OvertimeState } from '@prisma/client';

export class AttendanceMappers {
  static toUserData(user: any): UserData {
    return {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname || undefined,
      departmentName: user.department?.name || '',
      employeeType: user.employeeType,
      role: user.role,
      profilePictureUrl: user.profilePictureUrl,
      shiftId: user.shiftCode,
      shiftCode: user.shiftCode,
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      updatedAt: user.updatedAt,
    };
  }

  static toAttendanceRecord(dbAttendance: any): AttendanceRecord | null {
    if (!dbAttendance) return null;
    try {
      return {
        id: dbAttendance.id,
        employeeId: dbAttendance.employeeId,
        date: new Date(dbAttendance.date),
        state: AttendanceNormalizers.normalizeAttendanceState(
          dbAttendance.state,
        ),
        checkStatus: AttendanceNormalizers.normalizeCheckStatus(
          dbAttendance.checkStatus,
        ),
        isOvertime: dbAttendance.isOvertime || false,
        type: dbAttendance.isOvertime
          ? PeriodType.OVERTIME
          : PeriodType.REGULAR,
        overtimeState: AttendanceNormalizers.normalizeOvertimeState(
          dbAttendance.overtimeState,
        ),
        overtimeId: dbAttendance.overtimeId,

        // Add missing fields
        shiftStartTime: dbAttendance.shiftStartTime
          ? new Date(dbAttendance.shiftStartTime)
          : null,
        shiftEndTime: dbAttendance.shiftEndTime
          ? new Date(dbAttendance.shiftEndTime)
          : null,
        CheckInTime: dbAttendance.CheckInTime
          ? new Date(dbAttendance.CheckInTime)
          : null,
        CheckOutTime: dbAttendance.CheckOutTime
          ? new Date(dbAttendance.CheckOutTime)
          : null,

        isEarlyCheckIn: dbAttendance.isEarlyCheckIn || false,
        isLateCheckIn: dbAttendance.isLateCheckIn || false,
        isLateCheckOut: dbAttendance.isLateCheckOut || false,
        isVeryLateCheckOut: dbAttendance.isVeryLateCheckOut || false,
        lateCheckOutMinutes: dbAttendance.lateCheckOutMinutes || 0,

        // Safely handle location data
        checkInLocation: this.safeParseLocation(dbAttendance.checkInLocation),
        checkOutLocation: this.safeParseLocation(dbAttendance.checkOutLocation),
        checkInAddress: dbAttendance.checkInAddress || null,
        checkOutAddress: dbAttendance.checkOutAddress || null,

        isManualEntry: dbAttendance.isManualEntry || false,
        isDayOff: dbAttendance.isDayOff || false,

        timeEntries: (dbAttendance.timeEntries || []).map(this.mapTimeEntry),
        overtimeEntries: (dbAttendance.overtimeEntries || []).map(
          this.mapOvertimeEntry,
        ),

        createdAt: new Date(dbAttendance.createdAt),
        updatedAt: new Date(dbAttendance.updatedAt),
      };
    } catch (error) {
      console.error('Error mapping attendance record:', error);
      console.error('Problem attendance data:', dbAttendance);
      throw error;
    }
  }

  static toLatestAttendance(
    attendance: AttendanceRecord | null,
  ): LatestAttendanceResponse | null {
    if (!attendance) return null;

    return {
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: format(attendance.date, 'yyyy-MM-dd'),
      CheckInTime: attendance.CheckInTime
        ? format(attendance.CheckInTime, 'HH:mm:ss')
        : null,
      CheckOutTime: attendance.CheckOutTime
        ? format(attendance.CheckOutTime, 'HH:mm:ss')
        : null,
      state: attendance.state,
      checkStatus: attendance.checkStatus,
      overtimeState: attendance.overtimeState,
      isManualEntry: attendance.isManualEntry,
      isDayOff: false, // Since isDayOff is not in AttendanceRecord
      shiftStartTime: attendance.shiftStartTime
        ? format(attendance.shiftStartTime, 'HH:mm:ss')
        : undefined,
      shiftEndTime: attendance.shiftEndTime
        ? format(attendance.shiftEndTime, 'HH:mm:ss')
        : undefined,
      periodType: attendance.type,
      isOvertime: attendance.isOvertime,
      overtimeId: attendance.overtimeId,
      timeEntries: attendance.timeEntries.map((entry) => ({
        id: entry.id,
        startTime: format(entry.startTime, 'HH:mm:ss'),
        endTime: entry.endTime ? format(entry.endTime, 'HH:mm:ss') : null,
        type: entry.entryType,
      })),
    };
  }

  private static mapOvertimeEntry(entry: any): OvertimeEntry {
    return {
      id: entry.id,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      actualStartTime: entry.actualStartTime
        ? new Date(entry.actualStartTime)
        : null,
      actualEndTime: entry.actualEndTime ? new Date(entry.actualEndTime) : null,
      isDayOffOvertime: entry.isDayOffOvertime || false,
      isInsideShiftHours: entry.isInsideShiftHours || false,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    };
  }

  private static mapTimeEntry(entry: any): TimeEntry {
    return {
      id: entry.id,
      employeeId: entry.employeeId,
      date: new Date(entry.date),
      startTime: new Date(entry.startTime),
      endTime: entry.endTime ? new Date(entry.endTime) : null,
      status: entry.status || TimeEntryStatus.IN_PROGRESS,
      entryType: entry.entryType || PeriodType.REGULAR,
      regularHours: entry.regularHours || 0,
      overtimeHours: entry.overtimeHours || 0,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      actualMinutesLate: entry.actualMinutesLate || 0,
      isHalfDayLate: entry.isHalfDayLate || false,
      overtimeMetadata: entry.overtimeMetadata,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    };
  }

  private static safeParseLocation(location: any): any {
    if (!location) return null;

    if (typeof location === 'string') {
      try {
        return JSON.parse(location);
      } catch (error) {
        console.warn('Failed to parse location string:', location);
        return null;
      }
    }
  }

  static toCompositeStatus(
    attendance: AttendanceRecord,
  ): AttendanceCompositeStatus {
    return {
      state: attendance.state,
      checkStatus: attendance.checkStatus,
      isOvertime: attendance.isOvertime,
      overtimeState: attendance.overtimeState,
    };
  }

  // Helper function to map string to CheckStatus enum
  static mapToCheckStatus = (
    status: string | null | undefined,
  ): CheckStatus => {
    switch (status) {
      case 'checked-in':
        return CheckStatus.CHECKED_IN;
      case 'checked-out':
        return CheckStatus.CHECKED_OUT;
      default:
        return CheckStatus.PENDING;
    }
  };

  // Helper function to map string to AttendanceState enum
  static mapToAttendanceState = (
    state: string | null | undefined,
  ): AttendanceState => {
    switch (state) {
      case 'present':
        return AttendanceState.PRESENT;
      case 'absent':
        return AttendanceState.ABSENT;
      case 'incomplete':
        return AttendanceState.INCOMPLETE;
      case 'holiday':
        return AttendanceState.HOLIDAY;
      case 'off':
        return AttendanceState.OFF;
      case 'overtime':
        return AttendanceState.OVERTIME;
      default:
        return AttendanceState.ABSENT;
    }
  };

  // Helper function to map string to OvertimeState enum
  static mapToOvertimeState = (
    state: string | null | undefined,
  ): OvertimeState | undefined => {
    switch (state) {
      case 'not-started':
        return OvertimeState.NOT_STARTED;
      case 'overtime-started':
        return OvertimeState.IN_PROGRESS;
      case 'overtime-ended':
        return OvertimeState.COMPLETED;
      default:
        return undefined;
    }
  };
}

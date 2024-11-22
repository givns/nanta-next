// services/Attendance/utils/AttendanceMappers.ts

import { UserData } from '@/types/user';
import {
  AttendanceCompositeStatus,
  AttendanceState,
  CheckStatus,
  LatestAttendance,
  OvertimeState,
} from '@/types/attendance/status';
import {
  AttendanceRecord,
  TimeEntry,
  OvertimeEntry,
} from '@/types/attendance/records';
import { AttendanceNormalizers } from './AttendanceNormalizers';
import { format } from 'date-fns';

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

    return {
      id: dbAttendance.id,
      employeeId: dbAttendance.employeeId,
      date: new Date(dbAttendance.date),
      state: AttendanceNormalizers.normalizeAttendanceState(dbAttendance.state),
      checkStatus: AttendanceNormalizers.normalizeCheckStatus(
        dbAttendance.checkStatus,
      ),
      isOvertime: dbAttendance.isOvertime || false,
      overtimeState: AttendanceNormalizers.normalizeOvertimeState(
        dbAttendance.overtimeState,
      ),

      // Add missing fields
      shiftStartTime: dbAttendance.shiftStartTime
        ? new Date(dbAttendance.shiftStartTime)
        : null,
      shiftEndTime: dbAttendance.shiftEndTime
        ? new Date(dbAttendance.shiftEndTime)
        : null,
      lateCheckOutMinutes: dbAttendance.lateCheckOutMinutes || 0,
      isManualEntry: dbAttendance.isManualEntry || false,

      regularCheckInTime: dbAttendance.regularCheckInTime
        ? new Date(dbAttendance.regularCheckInTime)
        : null,
      regularCheckOutTime: dbAttendance.regularCheckOutTime
        ? new Date(dbAttendance.regularCheckOutTime)
        : null,

      isEarlyCheckIn: dbAttendance.isEarlyCheckIn || false,
      isLateCheckIn: dbAttendance.isLateCheckIn || false,
      isLateCheckOut: dbAttendance.isLateCheckOut || false,
      isVeryLateCheckOut: dbAttendance.isVeryLateCheckOut || false,

      checkInLocation: dbAttendance.checkInLocation
        ? JSON.parse(dbAttendance.checkInLocation)
        : null,
      checkOutLocation: dbAttendance.checkOutLocation
        ? JSON.parse(dbAttendance.checkOutLocation)
        : null,
      checkInAddress: dbAttendance.checkInAddress || null,
      checkOutAddress: dbAttendance.checkOutAddress || null,

      timeEntries: (dbAttendance.timeEntries || []).map(this.mapTimeEntry),
      overtimeEntries: (dbAttendance.overtimeEntries || []).map(
        this.mapOvertimeEntry,
      ),

      createdAt: new Date(dbAttendance.createdAt),
      updatedAt: new Date(dbAttendance.updatedAt),
    };
  }

  static toLatestAttendance(
    attendance: AttendanceRecord | null,
  ): LatestAttendance | null {
    if (!attendance) return null;

    return {
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: format(attendance.date, 'yyyy-MM-dd'),
      regularCheckInTime: attendance.regularCheckInTime
        ? format(attendance.regularCheckInTime, 'HH:mm:ss')
        : null,
      regularCheckOutTime: attendance.regularCheckOutTime
        ? format(attendance.regularCheckOutTime, 'HH:mm:ss')
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
    };
  }

  private static mapTimeEntry(entry: any): TimeEntry {
    return {
      id: entry.id,
      employeeId: entry.employeeId,
      date: new Date(entry.date),
      startTime: new Date(entry.startTime),
      endTime: entry.endTime ? new Date(entry.endTime) : null,
      status: AttendanceNormalizers.normalizeTimeEntryStatus(entry.status),
      entryType: AttendanceNormalizers.normalizePeriodType(entry.entryType),
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

  private static mapOvertimeEntry(entry: any): OvertimeEntry {
    return {
      id: entry.id,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      actualStartTime: new Date(entry.actualStartTime),
      actualEndTime: entry.actualEndTime ? new Date(entry.actualEndTime) : null,
      isDayOffOvertime: entry.isDayOffOvertime,
      isInsideShiftHours: entry.isInsideShiftHours,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    };
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

// services/Attendance/utils/AttendanceMappers.ts

import { UserData } from '../../../types/user';
import {
  AttendanceRecord,
  TimeEntry,
  SerializedAttendanceRecord,
  PrismaTimeEntry,
  UnifiedPeriodState,
  AttendanceCompositeStatus,
  GeoLocationJson,
} from '../../../types/attendance';
import {
  AttendanceState,
  CheckStatus,
  OvertimeEntry,
  OvertimeState,
} from '@prisma/client';

export class AttendanceMappers {
  static toLatestAttendance(attendance: any) {
    throw new Error('Method not implemented.');
  }
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
      // Core identifiers
      id: dbAttendance.id,
      employeeId: dbAttendance.employeeId,
      date: new Date(dbAttendance.date),
      periodSequence: dbAttendance.periodSequence || 0, // Add explicit periodSequence

      // Core status
      state: dbAttendance.state,
      checkStatus: dbAttendance.checkStatus,
      type: dbAttendance.type,

      // Overtime information
      isOvertime: dbAttendance.isOvertime,
      overtimeState: dbAttendance.overtimeState,
      overtimeId: dbAttendance.overtimeId,
      overtimeDuration: dbAttendance.overtimeDuration,

      // Time fields
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

      // Status flags
      checkTiming: {
        isEarlyCheckIn: dbAttendance.checkTiming?.isEarlyCheckIn || false,
        isLateCheckIn: dbAttendance.checkTiming?.isLateCheckIn || false,
        isLateCheckOut: dbAttendance.checkTiming?.isLateCheckOut || false,
        isVeryLateCheckOut:
          dbAttendance.checkTiming?.isVeryLateCheckOut || false,
        lateCheckInMinutes: dbAttendance.checkTiming?.lateCheckInMinutes || 0,
        lateCheckOutMinutes: dbAttendance.checkTiming?.lateCheckOutMinutes || 0,
      },

      // Location data
      location: {
        ...((dbAttendance.location?.checkInCoordinates ||
          dbAttendance.location?.checkInAddress) && {
          checkIn: {
            coordinates: this.parseLocation(
              dbAttendance.location.checkInCoordinates,
            ),
            address: dbAttendance.location.checkInAddress || null,
          },
        }),
        ...((dbAttendance.location?.checkOutCoordinates ||
          dbAttendance.location?.checkOutAddress) && {
          checkOut: {
            coordinates: this.parseLocation(
              dbAttendance.location.checkOutCoordinates,
            ),
            address: dbAttendance.location.checkOutAddress || null,
          },
        }),
      },

      // Related entries
      overtimeEntries: (dbAttendance.overtimeEntries || []).map(
        this.mapOvertimeEntry,
      ),
      timeEntries: (dbAttendance.timeEntries || []).map(this.mapTimeEntry),

      // Metadata
      metadata: {
        isManualEntry: dbAttendance.metadata?.isManualEntry || false,
        isDayOff: dbAttendance.metadata?.isDayOff || false,
        createdAt: new Date(
          dbAttendance.metadata?.createdAt || dbAttendance.createdAt,
        ),
        updatedAt: new Date(
          dbAttendance.metadata?.updatedAt || dbAttendance.updatedAt,
        ),
        source: dbAttendance.metadata?.source || 'system',
      },
    };
  }

  private static parseLocation(data: any): GeoLocationJson | null {
    if (!data) return null;

    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;

      if (
        !parsed ||
        typeof parsed.lat !== 'number' ||
        typeof parsed.lng !== 'number' ||
        typeof parsed.latitude !== 'number' ||
        typeof parsed.longitude !== 'number'
      ) {
        return null;
      }

      const location: GeoLocationJson = {
        lat: parsed.lat,
        lng: parsed.lng,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy: parsed.accuracy, // Add the missing property 'accuracy'
      };

      if (parsed.timestamp) {
        location.timestamp = new Date(parsed.timestamp).toISOString(); // Convert Date to string
      }

      if (typeof parsed.provider === 'string') {
        location.provider = parsed.provider;
      }

      return location;
    } catch (error) {
      console.warn('Failed to parse location:', error);
      return null;
    }
  }

  static toSerializedAttendanceRecord(
    record: AttendanceRecord,
  ): SerializedAttendanceRecord {
    return {
      // Core identifiers
      id: record.id,
      employeeId: record.employeeId,
      date: record.date.toISOString(),
      periodSequence: record.periodSequence,

      // Core status (remains the same)
      state: record.state,
      checkStatus: record.checkStatus,
      type: record.type,

      // Overtime information (remains the same)
      isOvertime: record.isOvertime,
      overtimeState: record.overtimeState,
      overtimeId: record.overtimeId,
      overtimeDuration: record.overtimeDuration,

      // Time fields (convert to ISO strings)
      shiftStartTime: record.shiftStartTime?.toISOString() || null,
      shiftEndTime: record.shiftEndTime?.toISOString() || null,
      CheckInTime: record.CheckInTime?.toISOString() || null,
      CheckOutTime: record.CheckOutTime?.toISOString() || null,

      // Status flags (direct copy)
      checkTiming: record.checkTiming,

      // Location data (direct copy)
      location: {
        checkIn: {
          coordinates: record.location.checkIn?.coordinates || null,
          address: record.location.checkIn?.address || null,
        },
        checkOut: {
          coordinates: record.location.checkOut?.coordinates || null,
          address: record.location.checkOut?.address || null,
        },
      },

      overtimeEntries: record.overtimeEntries.map((entry) => ({
        id: entry.id,
        attendanceId: entry.attendanceId,
        overtimeRequestId: entry.overtimeRequestId,
        actualStartTime: entry.actualStartTime?.toISOString() || null,
        actualEndTime: entry.actualEndTime?.toISOString() || null,
        createdAt: entry.createdAt.toISOString(), // Add the missing property 'createdAt'
        updatedAt: entry.updatedAt.toISOString(), // Add the missing property 'updatedAt'
      })),

      // Time entries (serialize dates)
      timeEntries: record.timeEntries.map((entry) => ({
        id: entry.id,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime?.toISOString() || null,
        type: entry.entryType,
        employeeId: entry.employeeId,
        status: entry.status,
        entryType: entry.entryType,
        hours: entry.hours,
        attendanceId: entry.attendanceId, // Add the missing property 'attendanceId'
        overtimeRequestId: entry.overtimeRequestId, // Add the missing property 'overtimeRequestId'
        timing: entry.timing, // Add the missing property 'timing'
        metadata: {
          ...entry.metadata,
          createdAt: entry.metadata.createdAt.toISOString(),
          updatedAt: entry.metadata.updatedAt.toISOString(),
        },
      })),

      // Metadata (serialize dates)
      metadata: {
        ...record.metadata,
        createdAt: record.metadata.createdAt.toISOString(),
        updatedAt: record.metadata.updatedAt.toISOString(),
      },
    };
  }

  static mapTimeEntry(prismaTimeEntry: PrismaTimeEntry): TimeEntry {
    return {
      id: prismaTimeEntry.id,
      employeeId: prismaTimeEntry.employeeId,
      date: prismaTimeEntry.date,
      startTime: prismaTimeEntry.startTime,
      endTime: prismaTimeEntry.endTime,
      status: prismaTimeEntry.status,
      entryType: prismaTimeEntry.entryType,

      // Add safety checks and handle both string and object cases
      hours:
        typeof prismaTimeEntry.hours === 'string'
          ? JSON.parse(prismaTimeEntry.hours)
          : prismaTimeEntry.hours,

      attendanceId: prismaTimeEntry.attendanceId,
      overtimeRequestId: prismaTimeEntry.overtimeRequestId,

      timing:
        typeof prismaTimeEntry.timing === 'string'
          ? JSON.parse(prismaTimeEntry.timing)
          : prismaTimeEntry.timing,

      overtime: prismaTimeEntry.overtime
        ? typeof prismaTimeEntry.overtime === 'string'
          ? JSON.parse(prismaTimeEntry.overtime)
          : prismaTimeEntry.overtime
        : undefined,

      metadata:
        typeof prismaTimeEntry.metadata === 'string'
          ? JSON.parse(prismaTimeEntry.metadata)
          : prismaTimeEntry.metadata,
    };
  }

  static toPrismaCreateInput(timeEntry: TimeEntry) {
    return {
      id: timeEntry.id,
      employeeId: timeEntry.employeeId,
      date: timeEntry.date,
      startTime: timeEntry.startTime,
      endTime: timeEntry.endTime,
      status: timeEntry.status,
      entryType: timeEntry.entryType,

      hours: JSON.stringify(timeEntry.hours),
      timing: JSON.stringify(timeEntry.timing),
      overtime: timeEntry.overtime
        ? JSON.stringify(timeEntry.overtime)
        : undefined,
      metadata: JSON.stringify(timeEntry.metadata),
    };
  }

  static mapOvertimeEntry(entry: any): OvertimeEntry {
    return {
      id: entry.id,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      actualStartTime: entry.actualStartTime
        ? new Date(entry.actualStartTime)
        : null,
      actualEndTime: entry.actualEndTime ? new Date(entry.actualEndTime) : null,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    };
  }

  // Helper method to create UnifiedPeriodState
  static toUnifiedPeriodState(
    record: AttendanceRecord,
    now: Date,
  ): UnifiedPeriodState {
    return {
      type: record.type,
      timeWindow: {
        start: record.shiftStartTime?.toISOString() || '',
        end: record.shiftEndTime?.toISOString() || '',
      },
      activity: {
        isActive: Boolean(record.CheckInTime && !record.CheckOutTime),
        checkIn: record.CheckInTime?.toISOString() || null,
        checkOut: record.CheckOutTime?.toISOString() || null,
        isOvertime: record.isOvertime,
        overtimeId: record.overtimeId,
        isDayOffOvertime: record.metadata.isDayOff,
      },
      validation: {
        isWithinBounds:
          record.checkTiming.isEarlyCheckIn === false &&
          record.checkTiming.isLateCheckOut === false,
        isEarly: record.checkTiming.isEarlyCheckIn,
        isLate: record.checkTiming.isLateCheckIn,
        isOvernight: record.shiftEndTime
          ? record.shiftEndTime < record.shiftStartTime!
          : false,
        isConnected: false, // This should be determined by service logic
      },
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

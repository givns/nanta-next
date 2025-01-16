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
  TimeEntryMetadata,
  TimeEntryHours,
  TimeEntryTiming,
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
      timeEntries: (dbAttendance.timeEntries || [])
        .map((entry: any) => {
          try {
            const mappedEntry = this.mapTimeEntry(entry);
            console.log('Mapped time entry:', {
              id: mappedEntry.id,
              hours: mappedEntry.hours,
            });
            return mappedEntry;
          } catch (error) {
            console.error('Error mapping time entry:', error);
            return null;
          }
        })
        .filter(Boolean), // Remove any failed mappings
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
    // Safe date conversion function
    const safeToISOString = (
      date: Date | string | null | undefined,
    ): string | null => {
      if (date instanceof Date) {
        return date.toISOString();
      }
      if (typeof date === 'string') {
        return date;
      }
      return null;
    };

    return {
      // Core identifiers
      id: record.id,
      employeeId: record.employeeId,
      date: safeToISOString(record.date) || '',
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
      shiftStartTime: safeToISOString(record.shiftStartTime),
      shiftEndTime: safeToISOString(record.shiftEndTime),
      CheckInTime: safeToISOString(record.CheckInTime),
      CheckOutTime: safeToISOString(record.CheckOutTime),

      // Status flags (direct copy)
      checkTiming: record.checkTiming,

      // Location data (direct copy)
      location: {
        checkIn: {
          coordinates: record.location?.checkIn?.coordinates || null,
          address: record.location?.checkIn?.address || null,
        },
        checkOut: {
          coordinates: record.location?.checkOut?.coordinates || null,
          address: record.location?.checkOut?.address || null,
        },
      },

      overtimeEntries:
        record.overtimeEntries?.map((entry) => ({
          id: entry.id,
          attendanceId: entry.attendanceId,
          overtimeRequestId: entry.overtimeRequestId,
          actualStartTime: safeToISOString(entry.actualStartTime),
          actualEndTime: safeToISOString(entry.actualEndTime),
          createdAt: safeToISOString(entry.createdAt) || '',
          updatedAt: safeToISOString(entry.updatedAt) || '',
        })) || [],

      // Time entries (serialize dates)
      timeEntries:
        record.timeEntries?.map((entry) => ({
          id: entry.id,
          startTime: safeToISOString(entry.startTime) || '',
          endTime: safeToISOString(entry.endTime),
          type: entry.entryType,
          employeeId: entry.employeeId,
          status: entry.status,
          entryType: entry.entryType,
          hours: entry.hours,
          attendanceId: entry.attendanceId,
          overtimeRequestId: entry.overtimeRequestId,
          timing: entry.timing,
          metadata: {
            ...entry.metadata,
            createdAt: safeToISOString(entry.metadata?.createdAt) || '',
            updatedAt: safeToISOString(entry.metadata?.updatedAt) || '',
          },
        })) || [],

      // Metadata (serialize dates)
      metadata: {
        ...record.metadata,
        createdAt: safeToISOString(record.metadata?.createdAt) || '',
        updatedAt: safeToISOString(record.metadata?.updatedAt) || '',
      },
    };
  }

  static mapTimeEntry(prismaTimeEntry: PrismaTimeEntry): TimeEntry {
    // Parse hours safely with default values
    let hours: TimeEntryHours = { regular: 0, overtime: 0 };
    try {
      const rawHours =
        typeof prismaTimeEntry.hours === 'string'
          ? JSON.parse(prismaTimeEntry.hours)
          : prismaTimeEntry.hours;
      hours = {
        regular: Number(rawHours?.regular || 0),
        overtime: Number(rawHours?.overtime || 0),
      };
    } catch (error) {
      console.error('Error parsing hours:', error);
    }

    // Parse timing safely
    let timing: TimeEntryTiming = {
      actualMinutesLate: 0,
      isHalfDayLate: false,
    };
    try {
      const rawTiming =
        typeof prismaTimeEntry.timing === 'string'
          ? JSON.parse(prismaTimeEntry.timing)
          : prismaTimeEntry.timing;
      timing = {
        actualMinutesLate: Number(rawTiming?.actualMinutesLate || 0),
        isHalfDayLate: Boolean(rawTiming?.isHalfDayLate),
      };
    } catch (error) {
      console.error('Error parsing timing:', error);
    }

    // Parse metadata safely
    let metadata: TimeEntryMetadata = {
      source: 'system',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      const rawMetadata =
        typeof prismaTimeEntry.metadata === 'string'
          ? JSON.parse(prismaTimeEntry.metadata)
          : prismaTimeEntry.metadata;
      metadata = {
        source: rawMetadata?.source || 'system',
        version: Number(rawMetadata?.version || 1),
        createdAt: new Date(rawMetadata?.createdAt || Date.now()),
        updatedAt: new Date(rawMetadata?.updatedAt || Date.now()),
      };
    } catch (error) {
      console.error('Error parsing metadata:', error);
    }

    return {
      id: prismaTimeEntry.id,
      employeeId: prismaTimeEntry.employeeId,
      date: new Date(prismaTimeEntry.date),
      startTime: new Date(prismaTimeEntry.startTime),
      endTime: prismaTimeEntry.endTime
        ? new Date(prismaTimeEntry.endTime)
        : null,
      status: prismaTimeEntry.status,
      entryType: prismaTimeEntry.entryType,
      hours,
      timing,
      attendanceId: prismaTimeEntry.attendanceId,
      overtimeRequestId: prismaTimeEntry.overtimeRequestId,
      metadata,
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
      hours: JSON.stringify({
        regular: Number(timeEntry.hours.regular || 0),
        overtime: Number(timeEntry.hours.overtime || 0),
      }),
      timing: JSON.stringify({
        actualMinutesLate: Number(timeEntry.timing.actualMinutesLate || 0),
        isHalfDayLate: Boolean(timeEntry.timing.isHalfDayLate),
      }),
      metadata: JSON.stringify({
        source: timeEntry.metadata.source || 'system',
        version: Number(timeEntry.metadata.version || 1),
        createdAt: new Date(timeEntry.metadata.createdAt).toISOString(),
        updatedAt: new Date(timeEntry.metadata.updatedAt).toISOString(),
      }),
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

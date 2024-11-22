// services/cache/CacheManager.ts

import { endOfDay, format, startOfDay } from 'date-fns';
import { cacheService } from './CacheService';
import { CACHE_CONSTANTS } from '@/types/attendance/base';
import { PrismaClient, User } from '@prisma/client';
import {
  ApprovedOvertimeInfo,
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntryStatus,
} from '@/types/attendance/status';
import {
  AttendanceRecord,
  OvertimeEntry,
  TimeEntry,
} from '@/types/attendance/records';
import { FutureShift, ShiftData } from '@/types/attendance/shift';
import { LeaveRequest } from '@/types/attendance';
import { getCurrentTime } from '@/utils/dateUtils';
import { HolidayService } from './HolidayService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { PrismaHoliday } from '@/types/attendance';
import { id } from 'date-fns/locale';
export class CacheManager {
  constructor(
    private prisma: PrismaClient,
    private shiftService: ShiftManagementService,
    private holidayService: HolidayService,
    private leaveService: LeaveServiceServer,
    private overtimeService: OvertimeServiceServer,
  ) {}

  // Update static methods to use instance methods
  private static instance: CacheManager;

  static initialize(
    prisma: PrismaClient,
    shiftService: ShiftManagementService,
    holidayService: HolidayService,
    leaveService: LeaveServiceServer,
    overtimeService: OvertimeServiceServer,
  ) {
    this.instance = new CacheManager(
      prisma,
      shiftService,
      holidayService,
      leaveService,
      overtimeService,
    );
  }

  private static getInstance(): CacheManager {
    if (!this.instance) {
      throw new Error('CacheManager not initialized');
    }
    return this.instance;
  }

  // Convert static methods to instance methods
  async getAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo | null> {
    if (!cacheService) return null;
    const cacheKey = `attendance:${employeeId}`;
    const cached = await cacheService.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  }

  static async cacheAttendanceStatus(
    employeeId: string,
    status: AttendanceStatusInfo,
    ttl: number = CACHE_CONSTANTS.ATTENDANCE_CACHE_TTL,
  ): Promise<void> {
    if (!cacheService) return;
    const cacheKey = `attendance:${employeeId}`;
    await cacheService.set(cacheKey, JSON.stringify(status), ttl);
  }

  async fetchStatusData(
    employeeId: string,
  ): Promise<
    [
      User,
      AttendanceRecord | null,
      ShiftData,
      PrismaHoliday | null,
      LeaveRequest | null,
      boolean,
      ApprovedOvertimeInfo | null,
      FutureShift[],
      ApprovedOvertimeInfo[],
    ]
  > {
    const today = startOfDay(getCurrentTime());

    const [
      userResult,
      attendance,
      shiftResult,
      holidays,
      leaveRequest,
      pendingLeave,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
    ] = await Promise.all([
      // Handle non-nullable User
      this.prisma.user.findUniqueOrThrow({
        where: { employeeId },
      }),
      this.getLatestAttendance(employeeId),
      this.shiftService.getEffectiveShiftAndStatus(employeeId, today),
      this.holidayService.getHolidays(today, today),
      this.leaveService.checkUserOnLeave(employeeId, today),
      this.leaveService.hasPendingLeaveRequest(employeeId, today),
      this.overtimeService.getApprovedOvertimeRequest(employeeId, today),
      this.shiftService.getFutureShifts(employeeId, today),
      this.overtimeService.getFutureApprovedOvertimes(employeeId, today),
    ]);

    // Get ShiftData from EffectiveShiftResult
    const shiftData = shiftResult?.effectiveShift ?? {
      id: '',
      name: 'Default Shift',
      shiftCode: 'DEFAULT',
      startTime: '09:00',
      endTime: '18:00',
      workDays: [1, 2, 3, 4, 5],
    };

    // Map holidays to HolidayInfo format
    const holidayInfo =
      holidays.length > 0
        ? {
            id: holidays[0].id,
            localName: holidays[0].localName || '',
            name: holidays[0].name,
            date: format(holidays[0].date, 'yyyy-MM-dd'),
          }
        : null;

    return [
      userResult,
      attendance ? this.mapToAttendanceRecord(attendance) : null,
      shiftData,
      holidayInfo
        ? {
            id: holidayInfo.id,
            localName: holidayInfo.localName || '',
            name: holidayInfo.name,
            date: new Date(holidayInfo.date),
          }
        : null,
      leaveRequest as LeaveRequest, // Cast leaveRequest to type LeaveRequest
      pendingLeave,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
    ];
  }

  private mapToAttendanceRecord(prismaAttendance: any): AttendanceRecord {
    return {
      ...prismaAttendance,
      state: this.determineAttendanceState(prismaAttendance),
      checkStatus: this.determineCheckStatus(prismaAttendance),
      isOvertime: !!prismaAttendance.overtimeEntries?.length,
      // Ensure boolean fields have default values
      isEarlyCheckIn: !!prismaAttendance.isEarlyCheckIn,
      isLateCheckIn: !!prismaAttendance.isLateCheckIn,
      isLateCheckOut: !!prismaAttendance.isLateCheckOut,
      isVeryLateCheckOut: !!prismaAttendance.isVeryLateCheckOut,
      lateCheckOutMinutes: prismaAttendance.lateCheckOutMinutes ?? 0,
      overtimeState: prismaAttendance.overtimeEntries?.length
        ? this.determineOvertimeState(prismaAttendance.overtimeEntries[0])
        : undefined,
    };
  }

  private determineAttendanceState(attendance: any): AttendanceState {
    if (!attendance.regularCheckInTime) {
      return AttendanceState.ABSENT;
    }
    if (!attendance.regularCheckOutTime) {
      return AttendanceState.INCOMPLETE;
    }
    return attendance.overtimeEntries?.length
      ? AttendanceState.OVERTIME
      : AttendanceState.PRESENT;
  }

  private determineCheckStatus(attendance: any): CheckStatus {
    if (!attendance.regularCheckInTime) {
      return CheckStatus.PENDING;
    }
    return attendance.regularCheckOutTime
      ? CheckStatus.CHECKED_OUT
      : CheckStatus.CHECKED_IN;
  }

  private determineOvertimeState(overtimeEntry: any): OvertimeState {
    if (!overtimeEntry.actualStartTime) {
      return OvertimeState.NOT_STARTED;
    }
    if (!overtimeEntry.actualEndTime) {
      return OvertimeState.IN_PROGRESS;
    }
    return OvertimeState.COMPLETED;
  }

  private async getLatestAttendance(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    const today = startOfDay(getCurrentTime());

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: today,
          lt: endOfDay(today),
        },
      },
      orderBy: {
        date: 'desc',
      },
      include: {
        overtimeEntries: true,
        timeEntries: {
          include: {
            overtimeMetadata: true,
          },
        },
      },
    });

    if (!attendance) return null;

    const overtimeEntries: OvertimeEntry[] = attendance.overtimeEntries.map(
      (entry) => ({
        id: entry.id,
        attendanceId: entry.attendanceId,
        overtimeRequestId: entry.overtimeRequestId,
        actualStartTime: new Date(entry.actualStartTime),
        actualEndTime: entry.actualEndTime
          ? new Date(entry.actualEndTime)
          : null,
        state: this.determineOvertimeState(entry),
        isOvertime: true,
        isDayOffOvertime: false,
        isInsideShiftHours: false,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      }),
    );

    const timeEntries: TimeEntry[] = attendance.timeEntries.map((entry) => {
      const overtimeMetadata = entry.overtimeMetadata
        ? {
            id: entry.overtimeMetadata.id,
            timeEntryId: entry.id,
            isDayOffOvertime: entry.overtimeMetadata.isDayOffOvertime,
            isInsideShiftHours: entry.overtimeMetadata.isInsideShiftHours,
            createdAt: new Date(entry.overtimeMetadata.createdAt),
            updatedAt: new Date(entry.overtimeMetadata.updatedAt),
          }
        : undefined;

      return {
        id: entry.id,
        employeeId: entry.employeeId,
        date: new Date(entry.date),
        startTime: new Date(entry.startTime),
        endTime: entry.endTime ? new Date(entry.endTime) : null,
        status:
          entry.status === 'COMPLETED'
            ? TimeEntryStatus.COMPLETED
            : TimeEntryStatus.IN_PROGRESS,
        type:
          entry.entryType === 'overtime'
            ? PeriodType.OVERTIME
            : PeriodType.REGULAR,
        entryType:
          entry.entryType === 'overtime'
            ? PeriodType.OVERTIME
            : PeriodType.REGULAR,
        regularHours: entry.regularHours ?? 0,
        overtimeHours: entry.overtimeHours ?? 0,
        attendanceId: entry.attendanceId,
        overtimeRequestId: entry.overtimeRequestId,
        actualMinutesLate: entry.actualMinutesLate ?? 0,
        isHalfDayLate: entry.isHalfDayLate ?? false,
        overtimeMetadata,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      };
    });

    return {
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: new Date(attendance.date),
      state: this.determineAttendanceState(attendance),
      checkStatus: this.determineCheckStatus(attendance),
      isOvertime: overtimeEntries.length > 0,
      overtimeState:
        overtimeEntries.length > 0
          ? this.determineOvertimeState(overtimeEntries[0])
          : undefined,
      regularCheckInTime: attendance.regularCheckInTime
        ? new Date(attendance.regularCheckInTime)
        : null,
      regularCheckOutTime: attendance.regularCheckOutTime
        ? new Date(attendance.regularCheckOutTime)
        : null,
      shiftStartTime: attendance.shiftStartTime
        ? new Date(attendance.shiftStartTime)
        : null,
      shiftEndTime: attendance.shiftEndTime
        ? new Date(attendance.shiftEndTime)
        : null,
      isEarlyCheckIn: !!attendance.isEarlyCheckIn,
      isLateCheckIn: !!attendance.isLateCheckIn,
      isLateCheckOut: !!attendance.isLateCheckOut,
      isVeryLateCheckOut: !!attendance.isVeryLateCheckOut,
      lateCheckOutMinutes: attendance.lateCheckOutMinutes ?? 0,
      checkInLocation: attendance.checkInLocation
        ? JSON.parse(attendance.checkInLocation as string)
        : null,
      checkOutLocation: attendance.checkOutLocation
        ? JSON.parse(attendance.checkOutLocation as string)
        : null,
      checkInAddress: attendance.checkInAddress || null,
      checkOutAddress: attendance.checkOutAddress || null,
      overtimeEntries,
      timeEntries,
      createdAt: new Date(attendance.createdAt),
      updatedAt: new Date(attendance.updatedAt),
    } as AttendanceRecord;
  }

  // Static wrapper methods that use the instance
  static async getStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo | null> {
    return this.getInstance().getAttendanceStatus(employeeId);
  }

  static async fetchData(employeeId: string) {
    return this.getInstance().fetchStatusData(employeeId);
  }

  // Cache invalidation methods
  static async invalidateAttendanceCache(employeeId: string): Promise<void> {
    if (!cacheService) return;

    await Promise.all([
      cacheService.invalidatePattern(`attendance:${employeeId}*`),
      cacheService.invalidatePattern(`timeentry:${employeeId}*`),
      cacheService.invalidatePattern(`overtime:${employeeId}*`),
    ]);
  }

  static async invalidateUserCache(employeeId: string): Promise<void> {
    if (!cacheService) return;

    const today = format(new Date(), 'yyyy-MM-dd');
    await Promise.all([
      cacheService.invalidatePattern(`user:${employeeId}*`),
      cacheService.invalidatePattern(`attendance:${employeeId}*`),
      cacheService.invalidatePattern(`holiday:${today}*`),
    ]);
  }

  static async invalidateShiftCache(employeeId: string): Promise<void> {
    if (!cacheService) return;

    await Promise.all([
      cacheService.invalidatePattern(`shift:${employeeId}*`),
      cacheService.invalidatePattern(`schedule:${employeeId}*`),
    ]);
  }

  // Batch invalidation method
  static async invalidateAllEmployeeData(employeeId: string): Promise<void> {
    if (!cacheService) return;

    await Promise.all([
      this.invalidateAttendanceCache(employeeId),
      this.invalidateUserCache(employeeId),
      this.invalidateShiftCache(employeeId),
    ]);
  }

  // Cache getter methods with SWR pattern
  static async getCachedUserData<T>(
    employeeId: string,
    fetchFunction: () => Promise<T>,
  ): Promise<T | null> {
    if (!cacheService) return fetchFunction();

    const cacheKey = `user:${employeeId}`;
    return cacheService.getWithSWR(
      cacheKey,
      fetchFunction,
      CACHE_CONSTANTS.USER_CACHE_TTL,
    );
  }

  static async getCachedAttendanceData<T>(
    employeeId: string,
    date: string,
    fetchFunction: () => Promise<T>,
  ): Promise<T | null> {
    if (!cacheService) return fetchFunction();

    const cacheKey = `attendance:${employeeId}:${date}`;
    return cacheService.getWithSWR(
      cacheKey,
      fetchFunction,
      CACHE_CONSTANTS.ATTENDANCE_CACHE_TTL,
    );
  }

  // Generic cache setter
  static async setCacheData(
    key: string,
    data: any,
    ttl: number = CACHE_CONSTANTS.USER_CACHE_TTL,
  ): Promise<void> {
    if (!cacheService) return;

    await cacheService.set(key, JSON.stringify(data), ttl);
  }
}

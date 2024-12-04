// services/cache/CacheManager.ts

import { endOfDay, format, startOfDay } from 'date-fns';
import { cacheService } from './CacheService';
import { LeaveRequest, PrismaClient, User } from '@prisma/client';
import { number, string, z } from 'zod';
import {
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  OvertimeState,
  PeriodType,
  TimeEntryStatus,
  AttendanceRecord,
  OvertimeEntry,
  TimeEntry,
  ShiftData,
  PrismaHoliday,
  ApprovedOvertimeInfo,
  FutureShift,
  CACHE_CONSTANTS,
} from '../types/attendance';
import { getCurrentTime } from '../utils/dateUtils';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { HolidayService } from './HolidayService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { OvertimeServiceServer } from './OvertimeServiceServer';

// Cache key generation
const generateCacheKey = {
  user: (id: string) => `user:${id}`,
  attendance: (id: string, date: string) => `attendance:${id}:${date}`,
  shift: (id: string) => `shift:${id}`,
  all: (employeeId: string) => ({
    user: generateCacheKey.user(employeeId),
    attendance: generateCacheKey.attendance(
      employeeId,
      format(new Date(), 'yyyy-MM-dd'),
    ),
    shift: generateCacheKey.shift(employeeId),
  }),
};

export class CacheManager {
  private static instance: CacheManager | null = null;
  private constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly holidayService: HolidayService,
    private readonly leaveService: LeaveServiceServer,
    private readonly overtimeService: OvertimeServiceServer,
  ) {}

  static initialize(
    prisma: PrismaClient,
    shiftService: ShiftManagementService,
    holidayService: HolidayService,
    leaveService: LeaveServiceServer,
    overtimeService: OvertimeServiceServer,
  ): void {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(
        prisma,
        shiftService,
        holidayService,
        leaveService,
        overtimeService,
      );
    }
  }

  private static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      throw new Error('CacheManager not initialized');
    }
    return CacheManager.instance;
  }

  // Schema for runtime type checking
  private static AttendanceRecordSchema = z.object({
    id: z.string(),
    employeeId: z.string(),
    date: z.date(),
    state: z.nativeEnum(AttendanceState),
    checkStatus: z.nativeEnum(CheckStatus),
    isOvertime: z.boolean().optional(),
    overtimeState: z.nativeEnum(OvertimeState).optional(),
    regularCheckInTime: z.date().nullable(),
    regularCheckOutTime: z.date().nullable(),
    shiftStartTime: z.date().nullable(),
    shiftEndTime: z.date().nullable(),
    isEarlyCheckIn: z.boolean().optional(),
    isLateCheckIn: z.boolean().optional(),
    isLateCheckOut: z.boolean().optional(),
    isVeryLateCheckOut: z.boolean().optional(),
    lateCheckOutMinutes: z.number().optional(),
    checkInLocation: z.object({}).nullable(),
    checkOutLocation: z.object({}).nullable(),
    checkInAddress: z.string().nullable(),
    checkOutAddress: z.string().nullable(),
    overtimeEntries: z.array(z.object({})).optional(),
    timeEntries: z.array(z.object({})).optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  });

  private async fetchAttendanceRecord(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    const today = startOfDay(getCurrentTime());

    try {
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

      return this.mapAttendanceRecord(attendance);
    } catch (error) {
      console.error('Error fetching attendance record:', error);
      throw error;
    }
  }

  private mapAttendanceRecord(prismaAttendance: any): AttendanceRecord {
    const overtimeEntries = this.mapOvertimeEntries(
      prismaAttendance.overtimeEntries,
    );
    const timeEntries = this.mapTimeEntries(prismaAttendance.timeEntries);

    return {
      id: prismaAttendance.id,
      employeeId: prismaAttendance.employeeId,
      date: new Date(prismaAttendance.date),
      state: this.determineAttendanceState(prismaAttendance),
      checkStatus: this.determineCheckStatus(prismaAttendance),
      isOvertime: overtimeEntries.length > 0,
      overtimeState:
        overtimeEntries.length > 0
          ? this.determineOvertimeState(overtimeEntries[0])
          : undefined,
      regularCheckInTime: prismaAttendance.regularCheckInTime
        ? new Date(prismaAttendance.regularCheckInTime)
        : null,
      regularCheckOutTime: prismaAttendance.regularCheckOutTime
        ? new Date(prismaAttendance.regularCheckOutTime)
        : null,
      shiftStartTime: prismaAttendance.shiftStartTime
        ? new Date(prismaAttendance.shiftStartTime)
        : null,
      shiftEndTime: prismaAttendance.shiftEndTime
        ? new Date(prismaAttendance.shiftEndTime)
        : null,
      isEarlyCheckIn: Boolean(prismaAttendance.isEarlyCheckIn),
      isLateCheckIn: Boolean(prismaAttendance.isLateCheckIn),
      isLateCheckOut: Boolean(prismaAttendance.isLateCheckOut),
      isVeryLateCheckOut: Boolean(prismaAttendance.isVeryLateCheckOut),
      lateCheckOutMinutes: prismaAttendance.lateCheckOutMinutes ?? 0,
      checkInLocation: this.safeJSONParse(prismaAttendance.checkInLocation),
      checkOutLocation: this.safeJSONParse(prismaAttendance.checkOutLocation),
      checkInAddress: prismaAttendance.checkInAddress || null,
      checkOutAddress: prismaAttendance.checkOutAddress || null,
      isManualEntry: prismaAttendance.isManualEntry,
      overtimeEntries,
      timeEntries,
      createdAt: new Date(prismaAttendance.createdAt),
      updatedAt: new Date(prismaAttendance.updatedAt),
    };
  }

  private mapOvertimeEntries(entries: any[]): OvertimeEntry[] {
    return entries.map((entry) => ({
      id: entry.id,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      actualStartTime: new Date(entry.actualStartTime),
      actualEndTime: entry.actualEndTime ? new Date(entry.actualEndTime) : null,
      state: this.determineOvertimeState(entry),
      isOvertime: true,
      isDayOffOvertime: false,
      isInsideShiftHours: false,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    }));
  }

  private mapTimeEntries(entries: any[]): TimeEntry[] {
    return entries.map((entry) => ({
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
      overtimeMetadata: entry.overtimeMetadata
        ? {
            id: entry.overtimeMetadata.id,
            timeEntryId: entry.id,
            isDayOffOvertime: entry.overtimeMetadata.isDayOffOvertime,
            isInsideShiftHours: entry.overtimeMetadata.isInsideShiftHours,
            createdAt: new Date(entry.overtimeMetadata.createdAt),
            updatedAt: new Date(entry.overtimeMetadata.updatedAt),
          }
        : undefined,
      createdAt: new Date(entry.createdAt),
      updatedAt: new Date(entry.updatedAt),
    }));
  }

  private safeJSONParse(value: any): any {
    if (!value) return null;
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  // State determination methods
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

  private async getAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo | null> {
    if (!cacheService) return null;
    const cacheKey = generateCacheKey.attendance(
      employeeId,
      format(getCurrentTime(), 'yyyy-MM-dd'),
    );
    const cached = await cacheService.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
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

    console.log('CacheManager fetching data for:', employeeId);

    if (process.env.NODE_ENV === 'test') {
      const [
        userResult,
        attendance,
        shiftResult,
        holidays,
        leaveRequest,
        pendingLeave,
        approvedOvertime,
        futureShifts,
      ] = await Promise.all([
        this.prisma.user.findUniqueOrThrow({ where: { employeeId } }),
        this.getLatestAttendance(employeeId),
        this.shiftService.getEffectiveShiftAndStatus(employeeId, today),
        this.holidayService.getHolidays(today, today),
        this.leaveService.checkUserOnLeave(employeeId, today),
        this.leaveService.hasPendingLeaveRequest(employeeId, today),
        this.overtimeService.getApprovedOvertimeRequest(employeeId, today),
        this.shiftService.getFutureShifts(employeeId, today),
      ]);

      const shiftData = shiftResult?.effectiveShift ?? {
        id: '',
        name: 'Default Shift',
        shiftCode: 'DEFAULT',
        startTime: '09:00',
        endTime: '18:00',
        workDays: [1, 2, 3, 4, 5],
      };

      return [
        userResult,
        attendance ? this.mapAttendanceRecord(attendance) : null,
        shiftData,
        null,
        leaveRequest as LeaveRequest,
        pendingLeave,
        approvedOvertime,
        futureShifts,
        [],
      ];
    }

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
      this.prisma.user.findUniqueOrThrow({ where: { employeeId } }),
      this.fetchAttendanceRecord(employeeId),
      this.shiftService.getEffectiveShiftAndStatus(employeeId, today),
      this.holidayService.getHolidays(today, today),
      this.leaveService.checkUserOnLeave(employeeId, today),
      this.leaveService.hasPendingLeaveRequest(employeeId, today),
      this.overtimeService.getApprovedOvertimeRequest(employeeId, today),
      this.shiftService.getFutureShifts(employeeId, today),
      [], // Replace getFutureApprovedOvertimes call with empty array
    ]);

    const shiftData = shiftResult?.effectiveShift ?? {
      id: '',
      name: 'Default Shift',
      shiftCode: 'DEFAULT',
      startTime: '09:00',
      endTime: '18:00',
      workDays: [1, 2, 3, 4, 5],
    };

    const holidayInfo =
      holidays.length > 0
        ? {
            id: holidays[0].id,
            localName: holidays[0].localName || '',
            name: holidays[0].name,
            date: new Date(holidays[0].date),
          }
        : null;

    return [
      userResult,
      attendance,
      shiftData,
      holidayInfo,
      leaveRequest as LeaveRequest,
      pendingLeave,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
    ];
  }

  private async getLatestAttendance(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    return this.fetchAttendanceRecord(employeeId);
  }
  // Convert static methods to instance methods

  static async cacheAttendanceStatus(
    employeeId: string,
    status: AttendanceStatusInfo,
    ttl: number = CACHE_CONSTANTS.ATTENDANCE_CACHE_TTL,
  ): Promise<void> {
    if (!cacheService) return;
    const cacheKey = `attendance:${employeeId}`;

    // Don't cache in test environment
    if (process.env.NODE_ENV === 'test') return;

    await cacheService.set(cacheKey, JSON.stringify(status), ttl);
  }

  // Public static methods
  static async getStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo | null> {
    return CacheManager.getInstance().getAttendanceStatus(employeeId);
  }

  static async fetchData(employeeId: string) {
    return CacheManager.getInstance().fetchStatusData(employeeId);
  }

  // Cache invalidation methods with better error handling and logging
  static async invalidateCache(
    type: 'attendance' | 'user' | 'shift' | 'all',
    employeeId: string,
  ): Promise<void> {
    if (!cacheService) return;

    try {
      if (type === 'all') {
        await Promise.all([
          this.invalidateCache('attendance', employeeId),
          this.invalidateCache('user', employeeId),
          this.invalidateCache('shift', employeeId),
        ]);
        return;
      }

      const pattern = `${type}:${employeeId}*`;
      await cacheService.invalidatePattern(pattern);
      console.log(`Cache invalidated for pattern: ${pattern}`);
    } catch (error) {
      console.error(
        `Failed to invalidate cache for ${type}:${employeeId}`,
        error,
      );
      throw error;
    }
  }

  // Improved cache retrieval with better type safety and error handling
  static async getCachedData<T>(
    key: string,
    fetchFunction: () => Promise<T>,
    ttl: number,
    schema?: z.ZodType<T>,
  ): Promise<T | null> {
    if (!cacheService) return fetchFunction();

    try {
      return await cacheService.getWithSWR(key, fetchFunction, ttl, schema);
    } catch (error) {
      console.error(`Cache retrieval failed for key: ${key}`, error);
      return fetchFunction();
    }
  }
}

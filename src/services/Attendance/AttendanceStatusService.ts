//AttendanceStatusService.ts
import { PrismaClient, User, Attendance } from '@prisma/client';
import { UserData } from '../../types/user';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { HolidayService } from '../HolidayService';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { NotificationService } from '../NotificationService';
import { cacheService } from '../CacheService';
import { ErrorCode, AppError } from '../../types/errors';
import { getCurrentTime } from '../../utils/dateUtils';
import {
  format,
  startOfDay,
  endOfDay,
  isAfter,
  parseISO,
  isWithinInterval,
  addDays,
} from 'date-fns';
import {
  ApprovedOvertimeInfo,
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  CurrentPeriodInfo,
  OvertimeAttendanceInfo,
  OvertimeState,
  PeriodType,
} from '@/types/attendance/status';
import { AttendanceMappers } from './utils/AttendanceMappers';
import { CacheManager } from '../CacheManager';
import { AttendanceRecord } from '@/types/attendance/records';
import { TimeCalculationHelper } from './utils/TimeCalculationHelper';
import { StatusHelpers } from './utils/StatusHelper';
import { ShiftWindows } from '@/types/attendance/shift';
import { ShiftData } from '@/types/attendance';

export class AttendanceStatusService {
  constructor(
    private prisma: PrismaClient,
    private shiftService: ShiftManagementService,
    private holidayService: HolidayService,
    private leaveService: LeaveServiceServer,
    private overtimeService: OvertimeServiceServer,
    private notificationService: NotificationService,
  ) {
    // Initialize CacheManager with services
    CacheManager.initialize(
      prisma,
      shiftService,
      holidayService,
      leaveService,
      overtimeService,
    );
  }
  // attendance for first time user
  async createInitialAttendanceStatus(
    userId: string,
    preparedUser: any,
  ): Promise<AttendanceStatusInfo> {
    const now = getCurrentTime();
    const currentShift = await this.shiftService.getEffectiveShiftAndStatus(
      userId,
      now,
    );

    return {
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      user: AttendanceMappers.toUserData(preparedUser),
      isCheckingIn: true,
      isDayOff: false,
      isHoliday: false,
      isLate: false,
      isOvertime: false,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      shiftAdjustment: null,
      detailedStatus: 'absent',
      currentPeriod: {
        type: PeriodType.REGULAR,
        isComplete: false,
        current: {
          start: startOfDay(now),
          end: endOfDay(now),
        },
      },
      pendingLeaveRequest: false,
      approvedOvertime: null,
      futureShifts: [],
      futureOvertimes: [],
      overtimeAttendances: [],
      overtimeDuration: 0,
      overtimeEntries: [],
      latestAttendance: null,
      dayOffType: 'none',
      isOutsideShift: false,
    };
  }

  public mapLegacyStatus(status: string | null): {
    state: AttendanceState;
    checkStatus: CheckStatus;
    isOvertime: boolean;
    overtimeState?: OvertimeState;
  } {
    // Default values
    const defaultValues = {
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      isOvertime: false,
    };

    if (!status) return defaultValues;

    // Map legacy status to new format
    switch (status) {
      case 'present':
        return {
          state: AttendanceState.PRESENT,
          checkStatus: CheckStatus.CHECKED_OUT,
          isOvertime: false,
        };
      case 'checked-in':
        return {
          state: AttendanceState.PRESENT,
          checkStatus: CheckStatus.CHECKED_IN,
          isOvertime: false,
        };
      case 'overtime-started':
        return {
          state: AttendanceState.OVERTIME,
          checkStatus: CheckStatus.CHECKED_IN,
          isOvertime: true,
          overtimeState: OvertimeState.IN_PROGRESS,
        };
      case 'overtime-ended':
        return {
          state: AttendanceState.OVERTIME,
          checkStatus: CheckStatus.CHECKED_OUT,
          isOvertime: true,
          overtimeState: OvertimeState.COMPLETED,
        };
      // Add other mappings as needed
      default:
        return defaultValues;
    }
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const cachedStatus = await CacheManager.getStatus(employeeId);
    if (cachedStatus) return cachedStatus;

    const [
      user,
      attendance,
      shiftData,
      holidays,
      leaveRequest,
      pendingLeave,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
    ] = await CacheManager.fetchData(employeeId);

    if (!user) {
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    const shiftWindows = await this.shiftService.getShiftWindows(
      employeeId,
      new Date(),
    );
    // Safe array check
    const holidaysList = Array.isArray(holidays) ? holidays : [];
    const isHoliday = holidaysList.length > 0;
    const isDayOff = !shiftData.workDays.includes(new Date().getDay());

    // Map holiday info with safe access
    const holidayInfo =
      holidaysList.length > 0
        ? {
            localName: holidaysList[0].localName || '',
            name: holidaysList[0].name,
            date: format(holidaysList[0].date, 'yyyy-MM-dd'),
          }
        : null;

    const status: AttendanceStatusInfo = {
      // Base state
      state: this.determineState(
        attendance,
        isHoliday,
        isDayOff,
        approvedOvertime,
      ),
      checkStatus: attendance?.checkStatus ?? CheckStatus.PENDING,
      overtimeState: attendance?.overtimeState,
      isOvertime: !!approvedOvertime,
      isLate: attendance?.isLateCheckIn ?? false,
      shiftAdjustment: {
        date: format(new Date(), 'yyyy-MM-dd'),
        requestedShiftId: shiftData.id,
        requestedShift: shiftData,
      },
      // Time-related
      overtimeDuration: TimeCalculationHelper.calculateOvertimeDuration(
        attendance,
        approvedOvertime || null,
      ),
      overtimeEntries:
        attendance?.overtimeEntries.map((entry) => ({
          id: entry.id,
          attendanceId: entry.attendanceId,
          overtimeRequestId: entry.overtimeRequestId,
          actualStartTime: entry.actualStartTime,
          actualEndTime: entry.actualEndTime,
          isDayOffOvertime: approvedOvertime?.isDayOffOvertime ?? false,
          isInsideShiftHours: approvedOvertime?.isInsideShiftHours ?? false,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        })) ?? [],
      // Attendance flags
      isCheckingIn: !attendance?.regularCheckInTime,
      isEarlyCheckIn: attendance?.isEarlyCheckIn ?? false,
      isLateCheckIn: attendance?.isLateCheckIn ?? false,
      isLateCheckOut: attendance?.isLateCheckOut ?? false,

      // User and attendance info
      user: AttendanceMappers.toUserData(user),
      latestAttendance: attendance
        ? AttendanceMappers.toLatestAttendance(attendance)
        : null,

      // Status indicators
      isDayOff,
      isHoliday,
      holidayInfo,

      // Type information
      dayOffType: this.determineDayOffType(isHoliday, isDayOff),
      isOutsideShift: await this.shiftService.isOutsideShiftHours(
        employeeId,
        new Date(),
      ),

      // Related data
      approvedOvertime: approvedOvertime,
      futureShifts: futureShifts,
      futureOvertimes: futureOvertimes,
      overtimeAttendances: await this.overtimeService.getOvertimeAttendances(
        employeeId,
        new Date(),
      ),
      // Current period info
      currentPeriod: await this.determineCurrentPeriod(
        attendance,
        approvedOvertime, // Pass the actual ApprovedOvertimeInfo
        shiftWindows,
      ),

      // Status display
      detailedStatus: attendance
        ? StatusHelpers.getDisplayStatus(attendance, isHoliday)
        : 'absent',

      // Additional flags
      pendingLeaveRequest: pendingLeave,
    };

    await CacheManager.cacheAttendanceStatus(employeeId, status);
    return status;
  }

  private determineState(
    attendance: AttendanceRecord | null,
    isHoliday: boolean,
    isDayOff: boolean,
    overtime: ApprovedOvertimeInfo | null,
  ): AttendanceState {
    const now = getCurrentTime();

    // If there's active overtime, check that first
    if (overtime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`,
      );

      const isInOvertimePeriod = isWithinInterval(now, {
        start: overtimeStart,
        end: overtimeEnd,
      });

      if (isInOvertimePeriod && attendance?.regularCheckInTime) {
        return AttendanceState.OVERTIME;
      }
    }

    if (isHoliday) return AttendanceState.HOLIDAY;
    if (isDayOff && !overtime) return AttendanceState.OFF;
    if (!attendance?.regularCheckInTime) return AttendanceState.ABSENT;
    if (!attendance.regularCheckOutTime) return AttendanceState.INCOMPLETE;

    return attendance.isOvertime
      ? AttendanceState.OVERTIME
      : AttendanceState.PRESENT;
  }

  private determineDayOffType(
    isHoliday: boolean,
    isDayOff: boolean,
  ): 'holiday' | 'weekly' | 'none' {
    if (isHoliday) return 'holiday';
    if (isDayOff) return 'weekly';
    return 'none';
  }

  private async determineCurrentPeriod(
    attendance: AttendanceRecord | null,
    overtime: ApprovedOvertimeInfo | null,
    shiftWindows: ShiftWindows | null,
  ): Promise<CurrentPeriodInfo> {
    const now = getCurrentTime();

    // If there's an approved overtime, check if we're in that period first
    if (overtime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`,
      );

      // Check if current time is within overtime period
      const isInOvertimePeriod = isWithinInterval(now, {
        start: overtimeStart,
        end: overtimeEnd,
      });

      if (isInOvertimePeriod) {
        return {
          type: PeriodType.OVERTIME,
          overtimeId: overtime.id,
          isComplete: !!attendance?.regularCheckOutTime,
          checkInTime: attendance?.regularCheckInTime?.toISOString(),
          checkOutTime: attendance?.regularCheckOutTime?.toISOString(),
          current: {
            start: overtimeStart,
            end: overtimeEnd,
          },
        };
      }
    }

    // Default to regular period if not in overtime
    return {
      type: PeriodType.REGULAR,
      isComplete: !!attendance?.regularCheckOutTime,
      checkInTime: attendance?.regularCheckInTime?.toISOString(),
      checkOutTime: attendance?.regularCheckOutTime?.toISOString(),
      current: shiftWindows
        ? {
            start: shiftWindows.shiftStart,
            end: shiftWindows.shiftEnd,
          }
        : {
            start: startOfDay(now),
            end: endOfDay(now),
          },
    };
  }

  async checkMissingAttendance(): Promise<void> {
    const now = new Date();

    const users = await this.prisma.user.findMany({
      where: { shiftCode: { not: null } },
    });

    for (const user of users) {
      const attendance = await this.getLatestAttendanceStatus(user.employeeId);
      // Get shift data for the user
      const shiftData = await this.shiftService.getEffectiveShiftAndStatus(
        user.employeeId,
        now,
      );

      if (
        shiftData &&
        this.shouldNotifyMissing(attendance, now, shiftData.effectiveShift)
      ) {
        await this.notifyMissingAttendance(user, attendance);
      }
    }
  }

  private shouldNotifyMissing(
    status: AttendanceStatusInfo,
    now: Date,
    shift: ShiftData,
  ): boolean {
    if (status.isDayOff || status.isHoliday) return false;
    if (status.pendingLeaveRequest) return false;

    return (
      status.state === AttendanceState.ABSENT ||
      (status.state === AttendanceState.INCOMPLETE &&
        status.currentPeriod?.current &&
        TimeCalculationHelper.isOutsideShiftHours(now, shift))
    );
  }

  private async notifyMissingAttendance(
    user: User,
    status: AttendanceStatusInfo,
  ): Promise<void> {
    if (!user.lineUserId) return;

    const message =
      status.state === AttendanceState.ABSENT
        ? "You haven't checked in today."
        : "You haven't checked out today.";

    await this.notificationService.sendMissingCheckInNotification(
      user.lineUserId,
      message,
    );
  }
}

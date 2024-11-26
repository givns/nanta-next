//AttendanceStatusService.ts
import { PrismaClient, User } from '@prisma/client';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { HolidayService } from '../HolidayService';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { NotificationService } from '../NotificationService';
import { ErrorCode, AppError } from '../../types/errors';
import { getCurrentTime } from '../../utils/dateUtils';
import {
  format,
  startOfDay,
  endOfDay,
  parseISO,
  isWithinInterval,
  isAfter,
} from 'date-fns';
import {
  ApprovedOvertimeInfo,
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  CurrentPeriodInfo,
  OvertimeState,
  PeriodType,
  AttendanceRecord,
  ShiftWindows,
  ShiftData,
} from '../../types/attendance';
import { AttendanceMappers } from './utils/AttendanceMappers';
import { CacheManager } from '../CacheManager';
import { TimeCalculationHelper } from './utils/TimeCalculationHelper';
import { StatusHelpers } from './utils/StatusHelper';
import { UserRole } from '../../types/enum';
import { AttendanceStatusInfoSchema } from '@/schemas/attendance';

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
    const now = getCurrentTime();

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

    const periodInfo = await this.determineCurrentPeriod(
      attendance,
      approvedOvertime,
      await this.shiftService.getShiftWindows(employeeId, now),
    );

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

    // Then determine state based on period and other factors
    const status: AttendanceStatusInfo = {
      state: this.determineState(
        attendance,
        isHoliday,
        isDayOff,
        approvedOvertime,
      ),
      checkStatus: attendance?.checkStatus ?? CheckStatus.PENDING,
      overtimeState: attendance?.overtimeState,
      isOvertime: !!approvedOvertime && periodInfo.type === PeriodType.OVERTIME,
      isLate: attendance?.isLateCheckIn ?? false,
      shiftAdjustment: {
        date: format(new Date(), 'yyyy-MM-dd'),
        requestedShiftId: shiftData.id,
        requestedShift: shiftData,
      },
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
      isCheckingIn: !attendance?.regularCheckInTime,
      isEarlyCheckIn: attendance?.isEarlyCheckIn ?? false,
      isLateCheckIn: attendance?.isLateCheckIn ?? false,
      isLateCheckOut: attendance?.isLateCheckOut ?? false,
      user: AttendanceMappers.toUserData(user),
      latestAttendance: attendance
        ? AttendanceMappers.toLatestAttendance(attendance)
        : null,
      isDayOff,
      isHoliday,
      holidayInfo,
      dayOffType: this.determineDayOffType(isHoliday, isDayOff),
      isOutsideShift: await this.shiftService.isOutsideShiftHours(
        employeeId,
        new Date(),
      ),
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      overtimeAttendances: await this.overtimeService.getOvertimeAttendances(
        employeeId,
        new Date(),
      ),
      currentPeriod: periodInfo,
      detailedStatus: attendance
        ? StatusHelpers.getDisplayStatus(attendance, isHoliday)
        : 'absent',
      pendingLeaveRequest: pendingLeave,
    } satisfies AttendanceStatusInfo;

    if (process.env.NODE_ENV !== 'test') {
      await CacheManager.cacheAttendanceStatus(employeeId, status);
    }

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

    // Get the basic shift window
    const shiftPeriod = shiftWindows
      ? {
          start: shiftWindows.shiftStart,
          end: shiftWindows.shiftEnd,
        }
      : {
          start: startOfDay(now),
          end: endOfDay(now),
        };

    // If there's an approved overtime, check if we're in that period first
    if (overtime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtime.endTime}`,
      );

      // If we're in the overtime period
      if (isWithinInterval(now, { start: overtimeStart, end: overtimeEnd })) {
        return {
          type: PeriodType.OVERTIME,
          overtimeId: overtime.id,
          isComplete: attendance?.regularCheckOutTime != null,
          checkInTime: attendance?.regularCheckInTime?.toISOString(),
          checkOutTime: attendance?.regularCheckOutTime?.toISOString(),
          current: {
            start: overtimeStart,
            end: overtimeEnd,
          },
        };
      }

      // If regular shift has ended but overtime hasn't started
      if (isAfter(now, shiftPeriod.end) && !isAfter(now, overtimeStart)) {
        return {
          type: PeriodType.REGULAR,
          isComplete: true,
          checkInTime: attendance?.regularCheckInTime?.toISOString(),
          checkOutTime: attendance?.regularCheckOutTime?.toISOString(),
          current: shiftPeriod,
          next: {
            type: PeriodType.OVERTIME,
            startTime: overtime.startTime,
            overtimeId: overtime.id,
          },
        };
      }
    }

    // Default to regular period
    return {
      type: PeriodType.REGULAR,
      isComplete: isAfter(now, shiftPeriod.end),
      checkInTime: attendance?.regularCheckInTime?.toISOString(),
      checkOutTime: attendance?.regularCheckOutTime?.toISOString(),
      current: shiftPeriod,
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

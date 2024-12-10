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
  isValid,
  subMinutes,
  addDays,
  addMinutes,
} from 'date-fns';
import {
  ApprovedOvertimeInfo,
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  CurrentPeriodInfo,
  PeriodType,
  AttendanceRecord,
  ShiftWindows,
  ShiftData,
  ATTENDANCE_CONSTANTS,
} from '../../types/attendance';
import { AttendanceMappers } from './utils/AttendanceMappers';
import { CacheManager } from '../CacheManager';
import { TimeCalculationHelper } from './utils/TimeCalculationHelper';
import { StatusHelpers } from './utils/StatusHelper';

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
          start: format(startOfDay(now), 'yyyy-MM-dd HH:mm:ss'),
          end: format(endOfDay(now), 'yyyy-MM-dd HH:mm:ss'),
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

    console.log('Approved overtime:', approvedOvertime);
    const overtimeCheck =
      await this.overtimeService.getCurrentApprovedOvertimeRequest(
        employeeId,
        now,
      );
    console.log('Direct overtime check:', overtimeCheck);

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
      isOvertime: (() => {
        const hasOvertime = !!approvedOvertime;
        const isPeriodOvertime = periodInfo.type === PeriodType.OVERTIME;
        console.log('Overtime calc:', { hasOvertime, isPeriodOvertime });
        return hasOvertime && isPeriodOvertime;
      })(),
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
      isCheckingIn: !attendance?.CheckInTime,
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
    console.log('DetermineState:', {
      now: now.toISOString(),
      hasOvertime: !!overtime,
      overtimeTime: overtime
        ? {
            start: overtime.startTime,
            end: overtime.endTime,
          }
        : null,
    });

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

      if (isInOvertimePeriod && attendance?.CheckInTime) {
        return AttendanceState.OVERTIME;
      }
    }

    if (isHoliday) return AttendanceState.HOLIDAY;
    if (isDayOff && !overtime) return AttendanceState.OFF;
    if (!attendance?.CheckInTime) return AttendanceState.ABSENT;
    if (!attendance.CheckOutTime) return AttendanceState.INCOMPLETE;

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
          start: shiftWindows.start,
          end: shiftWindows.end,
        }
      : {
          start: startOfDay(now),
          end: endOfDay(now),
        };

    let current: { start: string; end: string };

    if (overtime) {
      const dateStr = format(now, 'yyyy-MM-dd');
      const overtimeStart = parseISO(`${dateStr}T${overtime.startTime}`);
      let overtimeEnd = parseISO(`${dateStr}T${overtime.endTime}`);

      // Handle overtime spanning midnight
      if (overtimeEnd < overtimeStart) {
        overtimeEnd = addDays(overtimeEnd, 1);
      }

      // Add early window to overtime period
      const earlyWindow = subMinutes(
        overtimeStart,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      );
      const lateWindow = addMinutes(
        overtimeEnd,
        ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
      );

      // If current time is within early window or overtime period
      if (isAfter(now, earlyWindow)) {
        current = {
          start: earlyWindow.toISOString(),
          end: lateWindow.toISOString(), // Convert lateWindow to string
        };

        return {
          type: PeriodType.OVERTIME,
          overtimeId: overtime.id,
          isComplete: attendance?.CheckOutTime != null,
          checkInTime: attendance?.CheckInTime?.toISOString(),
          checkOutTime: attendance?.CheckOutTime?.toISOString(),
          current,
        };
      }
    }

    if (shiftWindows) {
      current = {
        start: shiftWindows.start.toISOString(),
        end: shiftWindows.end.toISOString(),
      };
    } else {
      current = {
        start: startOfDay(now).toISOString(),
        end: endOfDay(now).toISOString(),
      };
    }

    // Validate dates
    if (!isValid(new Date(current.start)))
      current.start = startOfDay(now).toISOString();
    if (!isValid(new Date(current.end)))
      current.end = endOfDay(now).toISOString();

    return {
      type: PeriodType.REGULAR,
      isComplete: attendance?.CheckOutTime != null,
      checkInTime: attendance?.CheckInTime?.toISOString(),
      checkOutTime: attendance?.CheckOutTime?.toISOString(),
      current,
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

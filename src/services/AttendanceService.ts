import {
  PrismaClient,
  Attendance,
  User,
  Shift,
  LeaveRequest,
} from '@prisma/client';
import { ShiftManagementService } from './ShiftManagementService';
import { HolidayService } from './HolidayService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import {
  parseISO,
  format,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  isBefore,
  isAfter,
  isSameDay,
  addMinutes,
  addDays,
  max,
  min,
  subMinutes,
  subHours,
  set,
  subDays,
} from 'date-fns';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ProcessedAttendance,
  ShiftData,
  ApprovedOvertime,
  AttendanceStatusValue,
  AttendanceStatusType,
  CheckInOutAllowance,
} from '../types/attendance';
import { UserData } from '../types/user';
import { NotificationService } from './NotificationService';
import { UserRole } from '../types/enum';
import { TimeEntryService } from './TimeEntryService';
import {
  formatDateTime,
  formatTime,
  getCurrentTime,
  toBangkokTime,
} from '../utils/dateUtils';
import Redis from 'ioredis';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../lib/serverCache';
import { AppErrors } from '@/utils/errorHandler';
import { ErrorCode, AppError } from '../types/errors';

const USER_CACHE_TTL = 24 * 60 * 60; // 24 hours
const ATTENDANCE_CACHE_TTL = 30 * 60; // 30 minutes

export class AttendanceService {
  private redis: Redis | null = null;

  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
    private holidayService: HolidayService,
    private leaveService: LeaveServiceServer,
    private overtimeService: OvertimeServiceServer,
    private notificationService: NotificationService,
    private timeEntryService: TimeEntryService,
  ) {}

  async invalidateAttendanceCache(employeeId: string): Promise<void> {
    await invalidateCachePattern(`attendance:${employeeId}*`);
  }

  private async getCachedUserData(employeeId: string): Promise<User | null> {
    const cacheKey = `user:${employeeId}`;
    const cachedUser = await getCacheData(cacheKey);

    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });
    if (user) {
      await setCacheData(cacheKey, JSON.stringify(user), USER_CACHE_TTL);
    }

    return user;
  }

  public async isCheckInOutAllowed(
    employeeId: string,
    location: { lat: number; lng: number },
  ): Promise<CheckInOutAllowance> {
    const user = await this.getCachedUserData(employeeId);
    if (!user) {
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    const now = getCurrentTime();
    console.log(`Current time: ${formatDateTime(now, 'yyyy-MM-dd HH:mm:ss')}`);

    // Check holiday
    const isHoliday = await this.holidayService.isHoliday(
      now,
      [],
      user.shiftCode === 'SHIFT104',
    );
    if (isHoliday)
      return {
        allowed: true,
        reason: 'วันหยุด: การลงเวลาจะถูกบันทึกเป็นการทำงานล่วงเวลา',
        isOvertime: true,
      };

    // Check if user is on leave
    const leaveRequest = await this.leaveService.checkUserOnLeave(
      employeeId,
      now,
    );
    if (leaveRequest && leaveRequest.status === 'approved') {
      return { allowed: false, reason: 'User is on approved leave' };
    }
    console.log('Leave request:', leaveRequest);
    console.log('Leave request status:', leaveRequest?.status);
    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        employeeId,
        now,
      );

    if (!shiftData) {
      return {
        allowed: false,
        reason: 'No shift data available for the user',
      };
    }

    const { regularShift, effectiveShift, shiftstatus } = shiftData;
    console.log('Regular shift:', regularShift);
    console.log('Effective shift:', effectiveShift);
    console.log('Shift status:', shiftstatus);

    const {
      isOutsideShift = false,
      isLate = false,
      isOvertime = false,
    } = shiftstatus || {};

    // Check work days
    const today = now.getDay();
    if (!effectiveShift.workDays.includes(today)) {
      return {
        allowed: false,
        reason: 'วันหยุด: การลงเวลาจะต้องได้รับการอนุมัติ',
      };
    }

    const shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
    const shiftEnd = this.parseShiftTime(effectiveShift.endTime, now);
    const earlyCheckInWindow = subMinutes(shiftStart, 30);
    const lateCheckOutWindow = addMinutes(shiftEnd, 30);

    console.log(
      `Shift start: ${formatDateTime(shiftStart, 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log(
      `Shift end: ${formatDateTime(shiftEnd, 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log(
      `Early check-in window: ${formatDateTime(earlyCheckInWindow, 'yyyy-MM-dd HH:mm:ss')}`,
    );

    const minutesUntilAllowed = Math.ceil(
      differenceInMinutes(earlyCheckInWindow, now),
    );

    if (now < earlyCheckInWindow) {
      return {
        allowed: false,
        reason: `คุณกำลังเข้างานก่อนเวลาโดยไม่ได้รับการอนุมัติ กรุณารอ ${minutesUntilAllowed} นาทีเพื่อเข้างาน`,
        countdown: minutesUntilAllowed,
      };
    }

    if (isAfter(now, earlyCheckInWindow) && isBefore(now, shiftStart)) {
      return {
        allowed: true,
        reason: 'คุณกำลังเข้างานก่อนเวลา ระบบจะบันทึกเวลาเข้างานตามกะการทำงาน',
        isOvertime: false,
      };
    }

    if (isOutsideShift) {
      if (isOvertime || isAfter(now, lateCheckOutWindow)) {
        return {
          allowed: true,
          reason: 'คุณกำลังลงเวลานอกกะการทำงาน (ทำงานล่วงเวลา)',
          isOvertime: true,
        };
      } else if (isBefore(now, shiftStart)) {
        return {
          allowed: true,
          reason:
            'คุณกำลังเข้างานก่อนเวลา ระบบจะบันทึกเวลาเข้างานตามกะการทำงาน',
          isOvertime: false,
        };
      } else {
        return {
          allowed: false,
          reason: 'ไม่สามารถลงเวลาได้เนื่องจากอยู่นอกช่วงเวลาทำงาน',
          isOutsideShift: true,
        };
      }
    }

    if (isLate) {
      return {
        allowed: true,
        reason: 'คุณกำลังลงเวลาเข้างานสาย',
        isLate: true,
        isOvertime: false,
      };
    }
    return {
      allowed: true,
      isLate,
      isOvertime,
      countdown: minutesUntilAllowed,
    };
  }

  async processAttendance(
    attendanceData: AttendanceData,
  ): Promise<ProcessedAttendance> {
    try {
      const user = await this.getCachedUserData(attendanceData.employeeId);
      if (!user) throw new AppErrors('User not found', 404);

      const { isCheckIn, checkTime } = attendanceData;
      const parsedCheckTime = toBangkokTime(new Date(checkTime));
      console.log(
        `Parsed check time in processAttendance: ${formatDateTime(parsedCheckTime, 'yyyy-MM-dd HH:mm:ss')}`,
      );
      let attendanceDate = startOfDay(parsedCheckTime);
      if (!isCheckIn && parsedCheckTime.getHours() < 4) {
        attendanceDate = subDays(attendanceDate, 1);
      }

      console.log(
        `Determined attendance date: ${formatDateTime(attendanceDate, 'yyyy-MM-dd')}`,
      );

      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          user.employeeId,
          attendanceDate,
        );
      if (!shiftData || !shiftData.effectiveShift)
        throw new AppErrors('Effective shift not found', 404);

      const { effectiveShift } = shiftData;

      console.log(`Effective shift: ${JSON.stringify(effectiveShift)}`);

      const shiftStart = this.parseShiftTime(
        effectiveShift.startTime,
        attendanceDate,
      );
      const shiftEnd = this.parseShiftTime(
        effectiveShift.endTime,
        attendanceDate,
      );

      // Handle overnight shifts
      const adjustedShiftEnd =
        shiftEnd <= shiftStart ? addDays(shiftEnd, 1) : shiftEnd;

      console.log(
        `Shift start: ${formatDateTime(shiftStart, 'yyyy-MM-dd HH:mm:ss')}`,
      );
      console.log(
        `Shift end: ${formatDateTime(adjustedShiftEnd, 'yyyy-MM-dd HH:mm:ss')}`,
      );

      let existingAttendance = await this.prisma.attendance.findFirst({
        where: {
          employeeId: user.employeeId,
          date: {
            gte: startOfDay(subHours(attendanceDate, 12)), // Look back 12 hours
            lt: endOfDay(attendanceDate),
          },
        },
        orderBy: {
          date: 'desc',
        },
      });

      let regularHours = 0;
      let overtimeMinutes = 0;
      let isEarlyCheckIn = false;
      let isLateCheckIn = false;
      let isLateCheckOut = false;
      let status: AttendanceStatusValue = 'present';

      if (existingAttendance) {
        if (isCheckIn) {
          existingAttendance.checkInTime = parsedCheckTime;
          isEarlyCheckIn = isBefore(parsedCheckTime, shiftStart);
          isLateCheckIn = isAfter(parsedCheckTime, shiftStart);
        } else {
          let checkOutTime = parsedCheckTime;
          if (isBefore(checkOutTime, existingAttendance.checkInTime!)) {
            checkOutTime = addDays(checkOutTime, 1);
          }
          existingAttendance.checkOutTime = checkOutTime;
          isLateCheckOut = isAfter(checkOutTime, shiftEnd);

          const effectiveStartTime = max([
            existingAttendance.checkInTime!,
            shiftStart,
          ]);
          const effectiveEndTime = min([checkOutTime, shiftEnd]);
          regularHours = Math.max(
            0,
            differenceInMinutes(effectiveEndTime, effectiveStartTime) / 60,
          );

          const approvedOvertime =
            await this.overtimeService.getApprovedOvertimeRequest(
              user.employeeId,
              attendanceDate,
            );

          if (approvedOvertime) {
            const overtimeStart = max([
              parseISO(approvedOvertime.startTime),
              existingAttendance.checkInTime!,
            ]);
            const overtimeEnd = min([
              parseISO(approvedOvertime.endTime),
              checkOutTime,
            ]);
            overtimeMinutes = Math.max(
              0,
              differenceInMinutes(overtimeEnd, overtimeStart),
            );
          } else {
            overtimeMinutes = Math.max(
              0,
              differenceInMinutes(checkOutTime, shiftEnd),
            );
          }

          overtimeMinutes = Math.floor(overtimeMinutes / 30) * 30;
        }

        existingAttendance = await this.prisma.attendance.update({
          where: { id: existingAttendance.id },
          data: {
            checkInTime: existingAttendance.checkInTime,
            checkOutTime: existingAttendance.checkOutTime,
            status,
            isOvertime: overtimeMinutes >= 30,
            overtimeDuration: overtimeMinutes >= 30 ? overtimeMinutes / 60 : 0,
            isEarlyCheckIn,
            isLateCheckIn,
            isLateCheckOut,
          },
        });
      } else {
        existingAttendance = await this.prisma.attendance.create({
          data: {
            employeeId: user.employeeId,
            date: attendanceDate,
            checkInTime: isCheckIn ? parsedCheckTime : undefined,
            checkOutTime: !isCheckIn ? parsedCheckTime : undefined,
            status,
            isOvertime: false,
            overtimeDuration: 0,
            isManualEntry: false,
            isEarlyCheckIn: isCheckIn
              ? isBefore(parsedCheckTime, shiftStart)
              : false,
            isLateCheckIn: isCheckIn
              ? isAfter(parsedCheckTime, shiftStart)
              : false,
            isLateCheckOut: !isCheckIn
              ? isAfter(parsedCheckTime, shiftEnd)
              : false,
          },
        });
      }

      await this.timeEntryService.createOrUpdateTimeEntry(
        existingAttendance,
        isCheckIn,
      );

      const isOvertime = overtimeMinutes >= 30;
      const combinedLateCheckOut = isLateCheckOut || isOvertime;

      const detailedStatus = this.generateDetailedStatus(
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        combinedLateCheckOut,
      );

      const processedAttendance: ProcessedAttendance = {
        id: existingAttendance.id,
        employeeId: user.employeeId,
        date: attendanceDate,
        checkIn: existingAttendance.checkInTime
          ? formatTime(existingAttendance.checkInTime)
          : undefined,
        checkOut: existingAttendance.checkOutTime
          ? formatTime(existingAttendance.checkOutTime)
          : undefined,
        status,
        regularHours,
        overtimeHours: isOvertime ? overtimeMinutes / 60 : 0,
        isOvertime,
        detailedStatus,
        overtimeDuration: isOvertime ? overtimeMinutes / 60 : 0,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut: combinedLateCheckOut,
        isManualEntry: false,
      };

      await this.invalidateAttendanceCache(attendanceData.employeeId);
      await this.shiftManagementService.invalidateShiftCache(
        attendanceData.employeeId,
      );

      console.log('Processed attendance:', JSON.stringify(processedAttendance));

      return processedAttendance;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppErrors('Error processing attendance', 500);
    }
  }

  private parseShiftTime(timeString: string, date: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const cacheKey = `attendance:${employeeId}`;
    const cachedStatus = await getCacheData(cacheKey);

    if (cachedStatus) {
      const parsedStatus = JSON.parse(cachedStatus);
      // Check if the cached data is still valid
      if (parsedStatus.latestAttendance) {
        const latestAttendance = await this.getLatestAttendance(employeeId);
        if (
          !latestAttendance ||
          latestAttendance.id !== parsedStatus.latestAttendance.id
        ) {
          // If the latest attendance in the database doesn't match the cached one, fetch fresh data
          return this.fetchLatestAttendanceStatus(employeeId);
        }
      }
      return parsedStatus;
    }

    const status = await this.fetchLatestAttendanceStatus(employeeId);
    await setCacheData(cacheKey, JSON.stringify(status), ATTENDANCE_CACHE_TTL);
    return status;
  }

  private async fetchLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const user = await this.getCachedUserData(employeeId);
    if (!user) throw new Error('User not found');

    const today = startOfDay(getCurrentTime());
    const latestAttendance = await this.getLatestAttendance(employeeId);

    if (!user.shiftCode) throw new Error('User shift not found');

    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        employeeId,
        today,
      );
    if (!shiftData || !shiftData.effectiveShift)
      throw new Error('Shift not found');

    const { effectiveShift } = shiftData;

    const isHoliday = await this.holidayService.isHoliday(
      today,
      [],
      user.shiftCode === 'SHIFT104',
    );
    const leaveRequests = await this.leaveService.getLeaveRequests(employeeId);
    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(employeeId, today);
    const futureShifts = await this.shiftManagementService.getFutureShifts(
      employeeId,
      today,
    );
    const futureOvertimes =
      await this.overtimeService.getFutureApprovedOvertimes(employeeId, today);

    const pendingLeaveRequest = await this.leaveService.hasPendingLeaveRequest(
      employeeId,
      today,
    );

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      departmentName: user.departmentName || '',
      role: user.role as UserRole,
      profilePictureUrl: user.profilePictureUrl,
      shiftId: effectiveShift.id,
      shiftCode: effectiveShift.shiftCode,
      overtimeHours: user.overtimeHours,
      potentialOvertimes: [],
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      createdAt: user.createdAt ?? undefined,
      updatedAt: user.updatedAt ?? undefined,
    };

    return this.determineAttendanceStatus(
      userData,
      latestAttendance,
      effectiveShift,
      today,
      isHoliday,
      leaveRequests[0],
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      pendingLeaveRequest,
    );
  }

  async getAttendanceHistory(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ProcessedAttendance[]> {
    const attendances = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
        },
      },
      orderBy: { date: 'asc' },
    });

    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });
    if (!user) throw new Error('User not found');

    const shift = await this.shiftManagementService.getUserShift(user.id);
    if (!shift) throw new Error('User shift not found');

    const holidays = await this.holidayService.getHolidays(startDate, endDate);
    const leaveRequests = await this.leaveService.getLeaveRequests(employeeId);
    const approvedOvertimes =
      await this.overtimeService.getApprovedOvertimesInRange(
        employeeId,
        startDate,
        endDate,
      );

    return this.processAttendanceHistory(
      attendances,
      user,
      shift,
      holidays,
      leaveRequests,
      approvedOvertimes,
    );
  }

  private determineAttendanceStatus(
    user: UserData,
    attendance: Attendance | null,
    shift: ShiftData,
    now: Date,
    isHoliday: boolean,
    leaveRequest: LeaveRequest | null,
    approvedOvertime: ApprovedOvertime | null,
    futureShifts: Array<{ date: string; shift: ShiftData }>,
    futureOvertimes: Array<ApprovedOvertime>,
    pendingLeaveRequest: boolean,
  ): AttendanceStatusInfo {
    const shiftStart = shift ? this.parseShiftTime(shift.startTime, now) : null;
    const shiftEnd = shift ? this.parseShiftTime(shift.endTime, now) : null;

    let status: AttendanceStatusValue = 'absent';
    let isCheckingIn = true;
    if (attendance && attendance.checkInTime) {
      isCheckingIn = false;
      if (attendance.checkOutTime) {
        // If both check-in and check-out exist, user should be able to check-in again
        isCheckingIn = true;
      }
    }
    let detailedStatus = '';
    let isOvertime = false;
    let overtimeDuration = 0;

    if (isHoliday) {
      status = 'holiday';
      isCheckingIn = false;
    } else if (leaveRequest && leaveRequest.status === 'approved') {
      status = 'off';
      isCheckingIn = false;
    } else if (!attendance) {
      status = isBefore(now, shiftStart ?? new Date())
        ? 'absent'
        : 'incomplete';
    } else {
      if (
        attendance.checkOutTime &&
        isAfter(attendance.checkOutTime, shiftEnd ?? new Date())
      ) {
        isOvertime = true;
        overtimeDuration =
          differenceInMinutes(attendance.checkOutTime, shiftEnd ?? new Date()) /
          60;
      }
    }

    if (approvedOvertime && isSameDay(now, approvedOvertime.date)) {
      isOvertime = true;
      overtimeDuration =
        differenceInMinutes(
          parseISO(approvedOvertime.endTime),
          parseISO(approvedOvertime.startTime),
        ) / 60;
    }

    return {
      status,
      isOvertime,
      overtimeDuration,
      detailedStatus,
      isEarlyCheckIn: !!attendance?.isEarlyCheckIn,
      isLateCheckIn: attendance?.isLateCheckIn ?? false,
      isLateCheckOut: attendance?.isLateCheckOut ?? false,
      user,
      latestAttendance: attendance
        ? {
            id: attendance.id,
            employeeId: attendance.employeeId,
            date: format(attendance.date, 'yyyy-MM-dd'),
            checkInTime: attendance.checkInTime
              ? format(attendance.checkInTime, 'HH:mm:ss')
              : null,
            checkOutTime: attendance.checkOutTime
              ? format(attendance.checkOutTime, 'HH:mm:ss')
              : null,
            status: this.mapStatusToAttendanceStatusType(status),
            isManualEntry: attendance.isManualEntry,
          }
        : null,
      isCheckingIn,
      isDayOff: status === 'holiday' || status === 'off',
      potentialOvertimes: user.potentialOvertimes,
      shiftAdjustment: null, // Implement if needed
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      pendingLeaveRequest,
    };
  }

  async getLatestAttendance(employeeId: string): Promise<Attendance | null> {
    const today = startOfDay(getCurrentTime());
    return this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: today,
          lt: endOfDay(today),
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  private processAttendanceHistory(
    attendances: Attendance[],
    user: User,
    shift: Shift,
    holidays: { date: Date }[],
    leaveRequests: LeaveRequest[],
    overtimeRequests: ApprovedOvertime[],
  ): ProcessedAttendance[] {
    return attendances.map((attendance) => {
      const processedAttendance = this.processAttendanceRecord(
        attendance,
        shift,
      );
      const date = startOfDay(attendance.date);
      const isHoliday = holidays.some((holiday) =>
        isSameDay(holiday.date, date),
      );
      const leaveRequest = leaveRequests.find((leave) =>
        isSameDay(parseISO(leave.startDate.toString()), date),
      );
      const overtimeRequest = overtimeRequests.find((ot) =>
        isSameDay(ot.date, date),
      );

      let status: AttendanceStatusValue = processedAttendance.status;
      if (isHoliday) {
        status = 'holiday';
      } else if (leaveRequest) {
        status = 'off';
      }

      return {
        ...processedAttendance,
        status,
        isOvertime: !!overtimeRequest,
        overtimeHours: overtimeRequest
          ? this.calculateOvertimeHours(
              parseISO(overtimeRequest.endTime),
              parseISO(overtimeRequest.startTime),
            )
          : 0,
        detailedStatus: this.generateDetailedStatus(
          status,
          processedAttendance.isEarlyCheckIn,
          processedAttendance.isLateCheckIn,
          processedAttendance.isLateCheckOut,
        ),
      };
    });
  }

  private processAttendanceRecord(
    attendance: Attendance,
    shift: Shift,
  ): ProcessedAttendance {
    const shiftStart = this.parseShiftTime(shift.startTime, attendance.date);
    const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);

    const regularHours = this.calculateRegularHours(
      attendance.checkInTime || new Date(),
      attendance.checkOutTime || new Date(),
      shiftStart,
      shiftEnd,
    );
    const overtimeHours = attendance.checkOutTime
      ? this.calculateOvertimeHours(attendance.checkOutTime, shiftEnd)
      : 0;

    const status = this.calculateAttendanceStatus(attendance, shift);

    return {
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: attendance.date,
      checkIn: attendance.checkInTime
        ? format(attendance.checkInTime, 'HH:mm:ss')
        : undefined,
      checkOut: attendance.checkOutTime
        ? format(attendance.checkOutTime, 'HH:mm:ss')
        : undefined,
      status,
      regularHours,
      overtimeHours,
      isOvertime: overtimeHours > 0,
      detailedStatus: this.generateDetailedStatus(status),
      overtimeDuration: overtimeHours,
      isEarlyCheckIn: attendance.checkInTime
        ? isBefore(attendance.checkInTime, shiftStart)
        : false,
      isLateCheckIn: attendance.checkInTime
        ? isAfter(attendance.checkInTime, shiftStart)
        : false,
      isLateCheckOut: attendance.checkOutTime
        ? isAfter(attendance.checkOutTime, shiftEnd)
        : false,
      isManualEntry: attendance.isManualEntry,
    };
  }

  private determineCheckInStatus(
    checkTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): string {
    if (isBefore(checkTime, shiftStart)) return 'early-check-in';
    if (isAfter(checkTime, shiftStart) && isBefore(checkTime, shiftEnd))
      return 'on-time';
    return 'late-check-in';
  }

  private determineCheckOutStatus(
    checkTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): string {
    if (isBefore(checkTime, shiftEnd)) return 'early-leave';
    if (isAfter(checkTime, shiftEnd)) return 'overtime';
    return 'on-time';
  }

  private calculateRegularHours(
    checkInTime: Date,
    checkOutTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): number {
    const effectiveStart = isAfter(checkInTime, shiftStart)
      ? checkInTime
      : shiftStart;
    const effectiveEnd = isBefore(checkOutTime, shiftEnd)
      ? checkOutTime
      : shiftEnd;
    return Math.max(0, differenceInMinutes(effectiveEnd, effectiveStart) / 60);
  }

  private calculateOvertimeHours(checkOutTime: Date, shiftEnd: Date): number {
    if (isAfter(checkOutTime, shiftEnd)) {
      return differenceInMinutes(checkOutTime, shiftEnd) / 60;
    }
    return 0;
  }

  private mapStatusToAttendanceStatusType(
    status: AttendanceStatusValue,
  ): AttendanceStatusType {
    switch (status) {
      case 'present':
        return 'checked-out';
      case 'incomplete':
        return 'checked-in';
      case 'absent':
        return 'pending';
      case 'holiday':
      case 'off':
        return 'approved';
      default:
        return 'pending';
    }
  }

  private generateDetailedStatus(
    status: AttendanceStatusValue,
    isEarlyCheckIn?: boolean,
    isLateCheckIn?: boolean,
    isLateCheckOut?: boolean,
  ): string {
    if (status !== 'present') return status;

    const details: string[] = [];
    if (isEarlyCheckIn) details.push('early-check-in');
    if (isLateCheckIn) details.push('late-check-in');
    if (isLateCheckOut) details.push('late-check-out');

    return details.length > 0 ? details.join('-') : 'on-time';
  }

  async checkMissingAttendance() {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        shiftCode: { not: null },
      },
      include: {
        attendances: {
          where: {
            date: {
              gte: startOfDay(now),
              lte: endOfDay(now),
            },
          },
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    });

    for (const user of users) {
      await this.checkUserAttendance(user, now);
    }
  }

  private async checkUserAttendance(
    user: User & { attendances: Attendance[] },
    now: Date,
  ) {
    const cachedUser = await this.getCachedUserData(user.employeeId);
    if (!cachedUser) return;

    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        cachedUser.id,
        now,
      );
    if (!shiftData || !shiftData.effectiveShift) return;

    const { effectiveShift } = shiftData;
    const { shiftStart, shiftEnd } = this.getShiftTimes(effectiveShift, now);
    const latestAttendance = user.attendances[0];

    const isOnLeave = await this.leaveService.checkUserOnLeave(user.id, now);
    if (isOnLeave) return; //might need to use employeeId instead of user.id

    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(user.id, now);

    // Check for missing check-in
    if (
      isAfter(now, shiftStart) &&
      isBefore(now, shiftEnd) &&
      !latestAttendance
    ) {
      await this.sendMissingCheckInNotification(user);
      return;
    }

    // Check for missing check-out
    if (
      latestAttendance &&
      latestAttendance.checkInTime &&
      !latestAttendance.checkOutTime
    ) {
      const checkOutTime = approvedOvertime
        ? parseISO(approvedOvertime.endTime)
        : shiftEnd;
      if (isAfter(now, addMinutes(checkOutTime, 30))) {
        await this.sendMissingCheckOutNotification(user);
      }
    }
  }

  private getShiftTimes(shift: Shift, date: Date) {
    const shiftStart = this.parseShiftTime(shift.startTime, date);
    const shiftEnd = this.parseShiftTime(shift.endTime, date);
    return { shiftStart, shiftEnd };
  }

  private async sendMissingCheckInNotification(user: User) {
    if (user.lineUserId) {
      await this.notificationService.sendMissingCheckInNotification(
        user.lineUserId,
      );
    }
  }

  private async sendMissingCheckOutNotification(user: User) {
    if (user.lineUserId) {
      await this.notificationService.sendMissingCheckInNotification(
        user.lineUserId,
      );
    }
  }

  // Helper method to invalidate user cache
  private async invalidateUserCache(employeeId: string) {
    if (this.redis) {
      const cacheKey = `user:${employeeId}`;
      await this.redis.del(cacheKey);
    }
  }

  // Add this method to update user data and invalidate cache
  async updateUserData(employeeId: string, updateData: Partial<User>) {
    const updatedUser = await this.prisma.user.update({
      where: { employeeId },
      data: updateData,
    });

    await this.invalidateUserCache(employeeId);
    return updatedUser;
  }

  private calculateAttendanceStatus(
    attendance: Attendance,
    shift: Shift,
  ): AttendanceStatusValue {
    const shiftStart = this.parseShiftTime(shift.startTime, attendance.date);
    const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);

    if (!attendance.checkInTime) return 'absent';
    if (!attendance.checkOutTime) return 'incomplete';
    if (isAfter(attendance.checkOutTime, shiftEnd)) return 'present';
    if (isBefore(attendance.checkOutTime, shiftEnd)) return 'incomplete';
    return 'present';
  }
}

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
  differenceInHours,
  roundToNearestMinutes,
} from 'date-fns';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ProcessedAttendance,
  ShiftData,
  ApprovedOvertime,
  AttendanceStatusValue,
  AttendanceStatusType,
} from '../types/attendance';
import { UserData } from '../types/user';
import { NotificationService } from './NotificationService';
import { UserRole } from '../types/enum';
import { TimeEntryService } from './TimeEntryService';
import { formatDate, formatTime } from '../utils/dateUtils';
import { Redis } from 'ioredis';

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
  ) {
    this.initializeRedis();
  }

  private initializeRedis() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
      this.redis.on('error', (error) => {
        console.error('Redis error:', error);
      });
    } else {
      console.warn('REDIS_URL is not set. Caching will be disabled.');
    }
  }

  private async getCachedUserData(employeeId: string): Promise<User | null> {
    if (!this.redis) {
      return this.prisma.user.findUnique({
        where: { employeeId },
        include: { department: true },
      });
    }

    const cacheKey = `user:${employeeId}`;
    const cachedUser = await this.redis.get(cacheKey);

    if (cachedUser) {
      return JSON.parse(cachedUser);
    }

    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });

    if (user) {
      await this.redis.set(
        cacheKey,
        JSON.stringify(user),
        'EX',
        USER_CACHE_TTL,
      );
    }

    return user;
  }

  async processAttendance(
    attendanceData: AttendanceData,
  ): Promise<ProcessedAttendance> {
    const user = await this.getCachedUserData(attendanceData.employeeId);
    if (!user) throw new Error('User not found');

    const { isCheckIn, checkTime } = attendanceData;
    const parsedCheckTime = this.parseCheckTime(checkTime);
    const date = startOfDay(parsedCheckTime);

    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      user.employeeId,
      date,
    );
    if (!effectiveShift) throw new Error('Effective shift not found');

    const shiftStart = this.parseShiftTime(effectiveShift.startTime, date);
    const shiftEnd = this.parseShiftTime(effectiveShift.endTime, date);

    let existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: user.employeeId,
        date: date,
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
        isEarlyCheckIn = parsedCheckTime < shiftStart;
        isLateCheckIn = parsedCheckTime > shiftStart;
      } else {
        let checkOutTime = parsedCheckTime;
        if (checkOutTime < existingAttendance.checkInTime!) {
          checkOutTime = addDays(checkOutTime, 1);
        }
        existingAttendance.checkOutTime = checkOutTime;
        isLateCheckOut = checkOutTime > shiftEnd;

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
            date,
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
          date: date,
          checkInTime: isCheckIn ? parsedCheckTime : undefined,
          checkOutTime: !isCheckIn ? parsedCheckTime : undefined,
          status,
          isOvertime: false,
          overtimeDuration: 0,
          isManualEntry: false,
          isEarlyCheckIn: isCheckIn ? parsedCheckTime < shiftStart : false,
          isLateCheckIn: isCheckIn ? parsedCheckTime > shiftStart : false,
          isLateCheckOut: !isCheckIn ? parsedCheckTime > shiftEnd : false,
        },
      });
    }

    await this.timeEntryService.createOrUpdateTimeEntry(existingAttendance);

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
      date: new Date(formatDate(date)),
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

    // Invalidate the attendance cache after processing
    if (this.redis) {
      const attendanceCacheKey = `attendance:${attendanceData.employeeId}`;
      await this.redis.del(attendanceCacheKey);
    }

    return processedAttendance;
  }

  private parseCheckTime(checkTime: string | Date): Date {
    if (typeof checkTime === 'string') {
      if (checkTime.length <= 8) {
        const today = new Date();
        const [hours, minutes, seconds] = checkTime.split(':').map(Number);
        return new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          hours,
          minutes,
          seconds,
        );
      } else {
        return parseISO(checkTime);
      }
    } else if (checkTime instanceof Date) {
      return checkTime;
    } else {
      throw new Error('Invalid checkTime format');
    }
  }

  private parseShiftTime(timeString: string, referenceDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const shiftTime = new Date(referenceDate);
    shiftTime.setHours(hours, minutes, 0, 0);
    return shiftTime;
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    if (!this.redis) {
      return this.fetchLatestAttendanceStatus(employeeId);
    }

    const cacheKey = `attendance:${employeeId}`;
    const cachedStatus = await this.redis.get(cacheKey);

    if (cachedStatus) {
      return JSON.parse(cachedStatus);
    }

    const status = await this.fetchLatestAttendanceStatus(employeeId);
    await this.redis.set(
      cacheKey,
      JSON.stringify(status),
      'EX',
      ATTENDANCE_CACHE_TTL,
    );
    return status;
  }

  private async fetchLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const user = await this.getCachedUserData(employeeId);
    if (!user) throw new Error('User not found');

    const today = new Date();
    const latestAttendance = await this.getLatestAttendance(employeeId);

    if (!user.shiftCode) throw new Error('User shift not found');

    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      employeeId,
      today,
    );
    if (!effectiveShift) throw new Error('Shift not found');

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
      potentialOvertimes: [], // This should be populated if needed
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      createdAt: user.createdAt !== null ? user.createdAt : undefined,
      updatedAt: user.updatedAt !== null ? user.updatedAt : undefined,
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
  ): AttendanceStatusInfo {
    const shiftStart = this.parseShiftTime(shift.startTime, now);
    const shiftEnd = this.parseShiftTime(shift.endTime, now);

    let status: AttendanceStatusValue = 'absent';
    let isCheckingIn = true;
    let detailedStatus = '';
    let isOvertime = false;
    let overtimeDuration = 0;

    if (isHoliday) {
      status = 'holiday';
      isCheckingIn = false;
    } else if (leaveRequest) {
      status = 'off';
      isCheckingIn = false;
    } else if (!attendance) {
      status = isBefore(now, shiftStart) ? 'absent' : 'incomplete';
    } else {
      if (!attendance.checkOutTime) {
        status = 'present';
        isCheckingIn = false;
        detailedStatus = 'checked-in';
      } else {
        status = 'present';
        detailedStatus = 'checked-out';
        isCheckingIn = isAfter(now, endOfDay(attendance.date));

        if (isAfter(attendance.checkOutTime, shiftEnd)) {
          isOvertime = true;
          overtimeDuration =
            differenceInMinutes(attendance.checkOutTime, shiftEnd) / 60;
        }
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
      isEarlyCheckIn: attendance?.isEarlyCheckIn ?? undefined,
      isLateCheckIn: attendance?.isLateCheckIn ?? undefined,
      isLateCheckOut: attendance?.isLateCheckOut ?? undefined,
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
    };
  }

  async getLatestAttendance(employeeId: string): Promise<Attendance | null> {
    return this.prisma.attendance.findFirst({
      where: { employeeId },
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

  public async isCheckInOutAllowed(employeeId: string): Promise<{
    allowed: boolean;
    reason?: string;
    isLate?: boolean;
    isOvertime?: boolean;
  }> {
    const user = await this.prisma.user.findUnique({ where: { employeeId } });
    if (!user) throw new Error('User not found');

    const shiftStatus =
      await this.shiftManagementService.getShiftStatus(employeeId);

    const isHoliday = await this.holidayService.isHoliday(
      new Date(),
      [],
      user.shiftCode === 'SHIFT104',
    );
    if (isHoliday)
      return {
        allowed: true,
        reason: 'Holiday: Overtime will be recorded',
        isOvertime: true,
      };

    const leaveRequest = await this.leaveService.checkUserOnLeave(
      employeeId,
      new Date(),
    );
    if (leaveRequest)
      return { allowed: false, reason: 'User is on approved leave' };

    if (shiftStatus.isOutsideShift) {
      if (shiftStatus.isOvertime) {
        return {
          allowed: true,
          reason: 'Outside regular shift: Overtime will be recorded',
          isOvertime: true,
        };
      } else {
        return {
          allowed: true,
          reason: 'Early check-in: Time will be recorded',
          isOvertime: false,
        };
      }
    }

    if (shiftStatus.isLate) {
      return {
        allowed: true,
        reason: 'Late check-in',
        isLate: true,
        isOvertime: false,
      };
    }

    return { allowed: true };
  }

  private async checkUserAttendance(
    user: User & { attendances: Attendance[] },
    now: Date,
  ) {
    const cachedUser = await this.getCachedUserData(user.employeeId);
    if (!cachedUser) return;

    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      cachedUser.id,
      now,
    );
    if (!effectiveShift) return;

    const { shiftStart, shiftEnd } = this.getShiftTimes(effectiveShift, now);
    const latestAttendance = user.attendances[0];

    const isOnLeave = await this.leaveService.checkUserOnLeave(user.id, now);
    if (isOnLeave) return;

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

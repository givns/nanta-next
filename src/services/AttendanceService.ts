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
  isWithinInterval,
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
import { formatDateTime, formatTime, getCurrentTime } from '../utils/dateUtils';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../lib/serverCache';
import { ErrorCode, AppError } from '../types/errors';
import { cacheService } from './CacheService';
import { is } from 'date-fns/locale';

const USER_CACHE_TTL = 24 * 60 * 60; // 24 hours
const ATTENDANCE_CACHE_TTL = 30 * 60; // 30 minutes

export class AttendanceService {
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

  private async invalidateUserCache(employeeId: string) {
    if (cacheService) {
      await cacheService.invalidatePattern(`user:${employeeId}*`);
      await cacheService.invalidatePattern(`attendance:${employeeId}*`);
    }
  }

  async updateUserData(employeeId: string, updateData: Partial<User>) {
    const updatedUser = await this.prisma.user.update({
      where: { employeeId },
      data: updateData,
    });

    // Invalidate cache asynchronously
    this.invalidateUserCache(employeeId).catch((error) =>
      console.error(
        `Failed to invalidate cache for user ${employeeId}:`,
        error,
      ),
    );

    return updatedUser;
  }

  private async getCachedUserData(employeeId: string): Promise<User | null> {
    const cacheKey = `user:${employeeId}`;
    let cachedUser = await getCacheData(cacheKey);

    if (cachedUser) {
      console.log(`User data found in cache for key: ${cacheKey}`);
      return JSON.parse(cachedUser);
    }

    console.log(
      `User data not found in cache for key: ${cacheKey}, fetching from database`,
    );
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });

    if (user) {
      console.log(`Caching user data for key: ${cacheKey}`);
      await setCacheData(cacheKey, JSON.stringify(user), USER_CACHE_TTL);
      cachedUser = JSON.stringify(user);
    }

    return cachedUser ? JSON.parse(cachedUser) : null;
  }

  private parseShiftTime(timeString: string, date: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
  }

  private isOvernightShift(shiftStart: Date, shiftEnd: Date): boolean {
    return shiftEnd <= shiftStart;
  }

  private adjustDateForOvernightShift(
    date: Date,
    isCheckIn: boolean,
    shiftStart: Date,
    shiftEnd: Date,
  ): Date {
    if (
      this.isOvernightShift(shiftStart, shiftEnd) &&
      !isCheckIn &&
      date.getHours() < shiftStart.getHours()
    ) {
      return addDays(date, 1);
    }
    return date;
  }

  private roundTime(date: Date, roundToMinutes: number): Date {
    const coeff = 1000 * 60 * roundToMinutes;
    return new Date(Math.round(date.getTime() / coeff) * coeff);
  }

  public async isCheckInOutAllowed(
    employeeId: string,
    inPremises: boolean,
    address: string,
  ): Promise<CheckInOutAllowance> {
    try {
      console.log(
        `Checking allowance for employee ${employeeId} at address: ${address}, inPremises: ${inPremises}`,
      );

      const user = await this.getCachedUserData(employeeId);
      if (!user) {
        console.log(`User not found for employeeId: ${employeeId}`);
        throw new AppError({
          code: ErrorCode.USER_NOT_FOUND,
          message: 'User not found',
        });
      }

      const now = getCurrentTime();
      console.log('Current time:', formatDateTime(now, 'yyyy-MM-dd HH:mm:ss'));

      const isHoliday = await this.holidayService.isHoliday(
        now,
        [],
        user.shiftCode === 'SHIFT104',
      );
      console.log(`Is holiday: ${isHoliday}`);

      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          employeeId,
          now,
        );
      if (!shiftData) {
        console.log('No shift data available');
        return {
          allowed: false,
          reason: 'ไม่พบข้อมูลกะการทำงานของคุณ',
          inPremises,
          address,
        };
      }

      const { effectiveShift, shiftstatus } = shiftData;
      console.log('Effective shift:', effectiveShift);
      console.log('Shift status:', shiftstatus);

      const isDayOff =
        isHoliday || !shiftData.effectiveShift.workDays.includes(now.getDay());

      const approvedOvertime =
        await this.overtimeService.getApprovedOvertimeRequest(employeeId, now);

      if (isDayOff && !approvedOvertime) {
        return {
          allowed: false,
          reason: 'วันหยุด: การลงเวลาจะต้องได้รับการอนุมัติ',
          inPremises,
          address,
        };
      }

      if (approvedOvertime) {
        const overtimeStart = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
        );
        const overtimeEnd = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
        );

        if (now >= overtimeStart && now <= overtimeEnd) {
          return {
            allowed: true,
            reason: 'คุณกำลังลงเวลาในช่วงทำงานล่วงเวลาที่ได้รับอนุมัติ',
            isOvertime: true,
            inPremises,
            address,
          };
        }
      }

      if (!inPremises) {
        return {
          allowed: false,
          reason: 'ไม่สามารถลงเวลาได้เนื่องจากอยู่นอกสถานที่ทำงาน',
          inPremises,
          address,
        };
      }

      const leaveRequest = await this.leaveService.checkUserOnLeave(
        employeeId,
        now,
      );
      console.log('Leave request:', leaveRequest);
      if (leaveRequest && leaveRequest.status === 'approved') {
        return {
          allowed: false,
          reason: 'คุณอยู่ในช่วงการลาที่ได้รับอนุมัติ',
          inPremises,
          address,
        };
      }

      const pendingLeave = await this.leaveService.hasPendingLeaveRequest(
        employeeId,
        now,
      );
      console.log(`Pending leave request: ${pendingLeave}`);
      if (pendingLeave) {
        return {
          allowed: false,
          reason: 'คุณมีคำขอลาที่รออนุมัติสำหรับวันนี้',
          inPremises,
          address,
        };
      }

      const {
        isOutsideShift = false,
        isLate = false,
        isOvertime = false,
      } = shiftstatus || {};

      const shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
      const shiftEnd = this.parseShiftTime(effectiveShift.endTime, now);
      const earlyCheckInWindow = subMinutes(shiftStart, 30);
      const lateCheckOutWindow = addMinutes(shiftEnd, 30);

      console.log(
        'Early check-in window:',
        formatDateTime(earlyCheckInWindow, 'yyyy-MM-dd HH:mm:ss'),
      );
      console.log(
        'Late check-out window:',
        formatDateTime(lateCheckOutWindow, 'yyyy-MM-dd HH:mm:ss'),
      );

      const minutesUntilAllowed = Math.ceil(
        differenceInMinutes(earlyCheckInWindow, now),
      );

      if (now < earlyCheckInWindow) {
        return {
          allowed: false,
          reason: `คุณกำลังเข้างานก่อนเวลาโดยไม่ได้รับการอนุมัติ กรุณารอ ${minutesUntilAllowed} นาทีเพื่อเข้างาน`,
          countdown: minutesUntilAllowed,
          inPremises,
          address,
        };
      }

      if (isAfter(now, earlyCheckInWindow) && isBefore(now, shiftStart)) {
        return {
          allowed: true,
          reason:
            'คุณกำลังเข้างานก่อนเวลา ระบบจะบันทึกเวลาเข้างานตามกะการทำงาน',
          isOvertime: false,
          inPremises,
          address,
        };
      }

      if (isOutsideShift) {
        if (isOvertime || isAfter(now, lateCheckOutWindow)) {
          return {
            allowed: true,
            reason: 'คุณกำลังลงเวลานอกกะการทำงาน (ทำงานล่วงเวลา)',
            isOvertime: true,
            inPremises,
            address,
          };
        } else if (isBefore(now, shiftStart)) {
          return {
            allowed: true,
            reason:
              'คุณกำลังเข้างานก่อนเวลา ระบบจะบันทึกเวลาเข้างานตามกะการทำงาน',
            isOvertime: false,
            inPremises,
            address,
          };
        } else {
          return {
            allowed: false,
            reason: 'ไม่สามารถลงเวลาได้เนื่องจากอยู่นอกช่วงเวลาทำงาน',
            isOutsideShift: true,
            inPremises,
            address,
          };
        }
      }

      if (isLate) {
        return {
          allowed: true,
          reason: 'คุณกำลังลงเวลาเข้างานสาย',
          isLate: true,
          isOvertime: false,
          inPremises,
          address,
        };
      }

      return {
        allowed: true,
        isLate: shiftData.shiftstatus.isLate,
        isOvertime: shiftData.shiftstatus.isOvertime,
        inPremises: inPremises,
        address: address,
      };
    } catch (error) {
      console.error('Error in isCheckInOutAllowed:', error);
      return {
        allowed: false,
        reason: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์การลงเวลา',
        inPremises: inPremises,
        address: 'Unknown',
      };
    }
  }

  async processAttendance(
    attendanceData: AttendanceData,
  ): Promise<ProcessedAttendance> {
    try {
      console.log(
        'Starting processAttendance with data:',
        JSON.stringify(attendanceData),
      );

      if (!attendanceData.employeeId && attendanceData.lineUserId) {
        console.log(
          'employeeId not provided, attempting to find user by lineUserId',
        );
        const user = await this.prisma.user.findUnique({
          where: { lineUserId: attendanceData.lineUserId },
        });
        if (user) {
          attendanceData.employeeId = user.employeeId;
        }
      }

      if (!attendanceData.employeeId) {
        console.error('Unable to process attendance: No employeeId provided');
        throw new Error('Employee ID is required');
      }

      const user = await this.getCachedUserData(attendanceData.employeeId);
      console.log(
        'Attempting to get user with employeeId:',
        attendanceData.employeeId,
      );
      console.log('User data retrieved:', user);
      if (!user) {
        console.error(
          `User not found for employeeId: ${attendanceData.employeeId}`,
        );
        throw new Error('User not found');
      }

      const { isCheckIn, checkTime } = attendanceData;
      const parsedCheckTime = new Date(checkTime);
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

      let shiftData;
      try {
        shiftData =
          await this.shiftManagementService.getEffectiveShiftAndStatus(
            user.employeeId,
            attendanceDate,
          );
      } catch (error) {
        console.error('Error getting effective shift:', error);
        throw new Error('Failed to get effective shift');
      }

      if (!shiftData || !shiftData.effectiveShift) {
        console.error('Effective shift not found for user:', user.employeeId);
        throw new Error('Effective shift not found');
      }

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

      let status: AttendanceStatusValue = 'incomplete';
      let isEarlyCheckIn = false;
      let isLateCheckIn = false;
      let isLateCheckOut = false;
      let isOvertime = false;

      const approvedOvertimeRequest =
        await this.overtimeService.getApprovedOvertimeRequest(
          user.employeeId,
          attendanceDate,
        );

      if (attendanceData.isCheckIn) {
        const checkInStatus = this.determineCheckInStatus(
          parsedCheckTime,
          shiftStart,
          shiftEnd,
        );
        isEarlyCheckIn = checkInStatus === 'early-check-in';
        isLateCheckIn = checkInStatus === 'late-check-in';
      } else {
        // This is a check-out
        const checkInTime = await this.getLatestCheckInTime(
          attendanceData.employeeId,
          attendanceDate,
        );
        if (checkInTime) {
          const workedDurationMinutes = differenceInMinutes(
            parsedCheckTime,
            checkInTime,
          );
          const shiftDurationMinutes = differenceInMinutes(
            shiftEnd,
            shiftStart,
          );

          if (workedDurationMinutes >= shiftDurationMinutes) {
            status = 'present';
          } else {
            status = 'incomplete';
          }

          isOvertime = this.isOvertimeCheckOut(
            parsedCheckTime,
            shiftEnd,
            approvedOvertimeRequest,
          );
        } else {
          throw new Error(
            'Check-out attempted without a corresponding check-in',
          );
        }
      }

      const attendanceRecord = await this.updateOrCreateAttendanceRecord(
        user.employeeId,
        attendanceDate,
        parsedCheckTime,
        attendanceData.isCheckIn,
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        isOvertime,
      );

      const timeEntry = await this.timeEntryService.createOrUpdateTimeEntry(
        attendanceRecord,
        attendanceData.isCheckIn,
        approvedOvertimeRequest,
      );
      const detailedStatus = this.generateDetailedStatus(
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        isOvertime,
      );

      const processedAttendance: ProcessedAttendance = {
        id: attendanceRecord.id,
        employeeId: attendanceData.employeeId,
        date: attendanceDate,
        checkIn: attendanceRecord.checkInTime
          ? formatTime(attendanceRecord.checkInTime)
          : undefined,
        checkOut: attendanceRecord.checkOutTime
          ? formatTime(attendanceRecord.checkOutTime)
          : undefined,
        status,
        isOvertime,
        overtimeDuration: timeEntry.overtimeHours,
        regularHours: timeEntry.regularHours,
        detailedStatus,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        isManualEntry: false,
        attendanceStatusType: this.mapStatusToAttendanceStatusType(
          status,
          attendanceData.isCheckIn,
          isOvertime,
        ),
      };

      await this.invalidateAttendanceCache(attendanceData.employeeId);
      await this.shiftManagementService.invalidateShiftCache(
        attendanceData.employeeId,
      );

      return processedAttendance;
    } catch (error) {
      console.error('Error in processAttendance:', error);
      throw new Error(
        `Error processing attendance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private isOvertimeCheckOut(
    checkOutTime: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): boolean {
    if (isAfter(checkOutTime, shiftEnd)) {
      if (approvedOvertimeRequest) {
        const overtimeStart = parseISO(approvedOvertimeRequest.startTime);
        const overtimeEnd = parseISO(approvedOvertimeRequest.endTime);
        return isWithinInterval(checkOutTime, {
          start: overtimeStart,
          end: overtimeEnd,
        });
      }
      return true; // Consider it overtime even without approval, but it might be flagged differently
    }
    return false;
  }

  private async updateOrCreateAttendanceRecord(
    employeeId: string,
    date: Date,
    checkTime: Date,
    isCheckIn: boolean,
    status: AttendanceStatusValue,
    isEarlyCheckIn: boolean,
    isLateCheckIn: boolean,
    isLateCheckOut: boolean,
    isOvertime: boolean,
  ): Promise<Attendance> {
    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        employeeId,
        date,
      );
    if (!shiftData || !shiftData.effectiveShift) {
      throw new Error('Effective shift not found');
    }

    const shiftStart = this.parseShiftTime(
      shiftData.effectiveShift.startTime,
      date,
    );
    const shiftEnd = this.parseShiftTime(
      shiftData.effectiveShift.endTime,
      date,
    );

    const isOvernightShift = shiftEnd < shiftStart;
    const queryStartDate = isOvernightShift
      ? subDays(startOfDay(checkTime), 1)
      : startOfDay(checkTime);
    const queryEndDate = isOvernightShift
      ? addDays(endOfDay(checkTime), 1)
      : endOfDay(checkTime);

    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: queryStartDate,
          lte: queryEndDate,
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    const overtimeDuration = isOvertime
      ? differenceInMinutes(checkTime, shiftEnd) / 60
      : 0;

    if (existingAttendance) {
      return this.prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          [isCheckIn ? 'checkInTime' : 'checkOutTime']: checkTime,
          status,
          isOvertime,
          overtimeDuration,
          isEarlyCheckIn: isCheckIn
            ? isEarlyCheckIn
            : existingAttendance.isEarlyCheckIn,
          isLateCheckIn: isCheckIn
            ? isLateCheckIn
            : existingAttendance.isLateCheckIn,
          isLateCheckOut: !isCheckIn
            ? isLateCheckOut
            : existingAttendance.isLateCheckOut,
        },
      });
    } else {
      const attendanceDate = isCheckIn ? checkTime : subDays(checkTime, 1);
      return this.prisma.attendance.create({
        data: {
          employeeId,
          date: startOfDay(attendanceDate),
          [isCheckIn ? 'checkInTime' : 'checkOutTime']: checkTime,
          status,
          isOvertime,
          overtimeDuration,
          isEarlyCheckIn,
          isLateCheckIn,
          isLateCheckOut,
        },
      });
    }
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const cacheKey = `attendance:${employeeId}`;
    const cachedStatus = await getCacheData(cacheKey);

    if (cachedStatus) {
      const parsedStatus = JSON.parse(cachedStatus);
      const cacheAge = Date.now() - parsedStatus.timestamp;
      if (cacheAge < 5 * 60 * 1000) {
        // 5 minutes
        return parsedStatus;
      }
    }

    try {
      const status = await this.fetchLatestAttendanceStatus(employeeId);
      await setCacheData(
        cacheKey,
        JSON.stringify(status),
        ATTENDANCE_CACHE_TTL,
      );
      return status;
    } catch (error) {
      console.error(
        `Error fetching attendance status for ${employeeId}:`,
        error,
      );
      throw new Error('Failed to fetch attendance status');
    }
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
    let status: AttendanceStatusValue = 'absent';
    let isCheckingIn = true;
    let isOvertime = false;
    let overtimeDuration = 0;
    let isEarlyCheckIn = false;
    let isLateCheckIn = false;
    let isLateCheckOut = false;

    const isDayOff = isHoliday || !shift.workDays.includes(now.getDay());
    const shiftStart = this.parseShiftTime(shift.startTime, now);
    const shiftEnd = this.parseShiftTime(shift.endTime, now);

    if (attendance && attendance.checkInTime) {
      isCheckingIn = !attendance.checkOutTime;
      isEarlyCheckIn = isBefore(attendance.checkInTime, shiftStart);
      isLateCheckIn = isAfter(attendance.checkInTime, shiftStart);

      if (attendance.checkOutTime) {
        status = 'present';
        isLateCheckOut = isAfter(attendance.checkOutTime, shiftEnd);
      } else {
        status = 'incomplete';
      }

      if (approvedOvertime && isSameDay(now, approvedOvertime.date)) {
        const overtimeStart = parseISO(approvedOvertime.startTime);
        const overtimeEnd = parseISO(approvedOvertime.endTime);
        const effectiveStart = max([attendance.checkInTime, overtimeStart]);
        const effectiveEnd = attendance.checkOutTime
          ? min([attendance.checkOutTime, overtimeEnd])
          : now;

        if (effectiveEnd > effectiveStart) {
          isOvertime = true;
          overtimeDuration =
            differenceInMinutes(effectiveEnd, effectiveStart) / 60;
          status = 'overtime';
        }
      }
    }

    if (isDayOff && !approvedOvertime) {
      status = 'off';
      isCheckingIn = true;
    } else if (leaveRequest && leaveRequest.status === 'approved') {
      status = 'off';
      isCheckingIn = true;
    } else if (isHoliday) {
      status = 'holiday';
      isCheckingIn = true;
    }

    const combinedLateCheckOut = isLateCheckOut || isOvertime;
    const detailedStatus = this.generateDetailedStatus(
      status,
      isEarlyCheckIn,
      isLateCheckIn,
      combinedLateCheckOut,
      isOvertime,
    );

    return {
      status,
      isOvertime,
      overtimeDuration,
      detailedStatus,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut: combinedLateCheckOut,
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
            status: this.mapStatusToAttendanceStatusType(
              status,
              isCheckingIn,
              isOvertime,
            ),
            isManualEntry: attendance.isManualEntry,
          }
        : null,
      isCheckingIn,
      isDayOff,
      potentialOvertimes: user.potentialOvertimes,
      shiftAdjustment: null,
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

      const shiftStart = this.parseShiftTime(shift.startTime, attendance.date);
      const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);

      const overtimeHours = attendance.checkOutTime
        ? this.calculateOvertimeHours(attendance.checkOutTime, shiftEnd)
        : 0;

      let status: AttendanceStatusValue = processedAttendance.status;
      if (isHoliday) {
        status = 'holiday';
      } else if (leaveRequest) {
        status = 'off';
      }

      const isEarlyCheckIn = attendance.checkInTime
        ? isBefore(attendance.checkInTime, shiftStart)
        : false;
      const isLateCheckIn = attendance.checkInTime
        ? isAfter(attendance.checkInTime, shiftStart)
        : false;
      const isLateCheckOut = attendance.checkOutTime
        ? isAfter(attendance.checkOutTime, shiftEnd)
        : false;
      const isOvertime = overtimeHours > 0;

      const detailedStatus = this.generateDetailedStatus(
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        isOvertime,
      );

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
        detailedStatus,
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

    const isEarlyCheckIn = attendance.checkInTime
      ? isBefore(attendance.checkInTime, shiftStart)
      : false;
    const isLateCheckIn = attendance.checkInTime
      ? isAfter(attendance.checkInTime, shiftStart)
      : false;
    const isLateCheckOut = attendance.checkOutTime
      ? isAfter(attendance.checkOutTime, shiftEnd)
      : false;
    const isOvertime = overtimeHours > 0;

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
      detailedStatus: this.generateDetailedStatus(
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        isOvertime,
      ),
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
      attendanceStatusType: this.mapStatusToAttendanceStatusType(
        status,
        !attendance.checkOutTime,
        isOvertime,
      ),
    };
  }

  private async getLatestCheckInTime(
    employeeId: string,
    date: Date,
  ): Promise<Date | null> {
    const latestAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        checkInTime: { not: null },
      },
      orderBy: { checkInTime: 'desc' },
    });

    return latestAttendance?.checkInTime || null;
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

  private mapStatusToAttendanceStatusType(
    status: AttendanceStatusValue,
    isCheckingIn: boolean,
    isOvertime: boolean,
  ): AttendanceStatusType {
    switch (status) {
      case 'present':
        return 'checked-out';
      case 'incomplete':
        return isOvertime ? 'overtime-started' : 'checked-in';
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
    isEarlyCheckIn: boolean,
    isLateCheckIn: boolean,
    isLateCheckOut: boolean,
    isOvertime: boolean,
  ): string {
    if (status !== 'present' && status !== 'incomplete') return status;

    const details: string[] = [];
    if (isEarlyCheckIn) details.push('early-check-in');
    if (isLateCheckIn) details.push('late-check-in');
    if (isLateCheckOut) details.push('late-check-out');
    if (isOvertime) details.push('overtime');

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

    const isOnLeave = await this.leaveService.checkUserOnLeave(
      user.employeeId,
      now,
    );
    if (isOnLeave) return; //might need to use employeeId instead of user.id

    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(
        user.employeeId,
        now,
      );

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
        user.employeeId,
        user.lineUserId,
      );
    }
  }

  private async sendMissingCheckOutNotification(user: User) {
    if (user.lineUserId) {
      await this.notificationService.sendMissingCheckOutNotification(
        user.employeeId,
        user.lineUserId,
      );
    }
  }

  private calculateAttendanceStatus(
    attendance: Attendance,
    shift: Shift,
  ): AttendanceStatusValue {
    const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);

    if (!attendance.checkInTime) return 'absent';
    if (!attendance.checkOutTime) return 'incomplete';
    if (isAfter(attendance.checkOutTime, shiftEnd)) return 'present';
    if (isBefore(attendance.checkOutTime, shiftEnd)) return 'incomplete';
    return 'present';
  }
}

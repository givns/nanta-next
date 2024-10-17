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

const USER_CACHE_TTL = 72 * 60 * 60; // 24 hours
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
    isCheckingIn: boolean,
    shiftStart: Date,
    shiftEnd: Date,
  ): Date {
    if (
      this.isOvernightShift(shiftStart, shiftEnd) &&
      !isCheckingIn &&
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
      // 1. Fetch necessary data
      const user = await this.getCachedUserData(employeeId);
      if (!user)
        throw new AppError({
          code: ErrorCode.USER_NOT_FOUND,
          message: 'User not found',
        });

      const now = getCurrentTime();
      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          employeeId,
          now,
        );
      if (!shiftData)
        return this.createResponse(false, 'ไม่พบข้อมูลกะการทำงานของคุณ', {
          inPremises,
          address,
        });

      // 2. Extract relevant information
      const { effectiveShift, shiftstatus } = shiftData;
      const {
        isOutsideShift = false,
        isLate = false,
        isOvertime = false,
      } = shiftstatus || {};
      const isHoliday = await this.holidayService.isHoliday(
        now,
        [],
        user.shiftCode === 'SHIFT104',
      );
      const isDayOff =
        isHoliday || !effectiveShift.workDays.includes(now.getDay());

      // 3. Get attendance-related data
      const [
        approvedOvertime,
        pendingOvertime,
        leaveRequest,
        pendingLeave,
        latestAttendance,
      ] = await Promise.all([
        this.overtimeService.getApprovedOvertimeRequest(employeeId, now),
        this.overtimeService.getPendingOvertimeRequests(employeeId, now),
        this.leaveService.checkUserOnLeave(employeeId, now),
        this.leaveService.hasPendingLeaveRequest(employeeId, now),
        this.getLatestAttendance(employeeId),
      ]);

      const dayOffOvertimeRequest = isDayOff
        ? await this.overtimeService.getDayOffOvertimeRequest(employeeId, now)
        : null;

      // 4. Calculate time-related variables
      const shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
      const shiftEnd = this.parseShiftTime(effectiveShift.endTime, now);
      const earlyCheckInWindow = subMinutes(shiftStart, 30);
      const isCheckingIn = !latestAttendance || !latestAttendance.checkInTime;

      // 5. Check various scenarios
      if (!inPremises) {
        return this.createResponse(
          false,
          'ไม่สามารถลงเวลาได้เนื่องจากอยู่นอกสถานที่ทำงาน',
          { inPremises, address },
        );
      }

      if (isDayOff) {
        return this.handleDayOffScenario(
          dayOffOvertimeRequest,
          approvedOvertime,
          inPremises,
          address,
        );
      }

      if (leaveRequest && leaveRequest.status === 'approved') {
        if (leaveRequest.leaveFormat === 'ลาครึ่งวัน') {
          return this.handleHalfDayLeave(
            leaveRequest,
            now,
            shiftStart,
            shiftEnd,
            isCheckingIn,
            inPremises,
            address,
          );
        }
        return this.createResponse(
          false,
          'คุณอยู่ในช่วงการลาที่ได้รับอนุมัติ',
          { inPremises, address },
        );
      }

      if (pendingLeave) {
        return this.createResponse(
          false,
          'คุณมีคำขอลาที่รออนุมัติสำหรับวันนี้',
          { inPremises, address },
        );
      }

      if (approvedOvertime) {
        const response = this.handleApprovedOvertime(
          approvedOvertime,
          now,
          inPremises,
          address,
        );
        if (response) return response;
      }

      if (isCheckingIn) {
        return this.handleCheckIn(
          now,
          earlyCheckInWindow,
          shiftStart,
          isLate,
          inPremises,
          address,
        );
      } else {
        return this.handleCheckOut(
          now,
          shiftEnd,
          approvedOvertime,
          pendingOvertime,
          inPremises,
          address,
        );
      }
    } catch (error) {
      console.error('Error in isCheckInOutAllowed:', error);
      return this.createResponse(
        false,
        'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์การลงเวลา',
        { inPremises, address: 'Unknown' },
      );
    }
  }

  private createResponse(
    allowed: boolean,
    reason: string,
    options: Partial<CheckInOutAllowance>,
  ): CheckInOutAllowance {
    return {
      allowed,
      reason,
      inPremises: options.inPremises ?? false,
      address: options.address ?? '',
      ...options,
    };
  }

  private handleDayOffScenario(
    dayOffOvertimeRequest: any,
    approvedOvertime: any,
    inPremises: boolean,
    address: string,
  ): CheckInOutAllowance {
    if (dayOffOvertimeRequest?.status === 'approved' || approvedOvertime) {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาทำงานล่วงเวลาในวันหยุดที่ได้รับอนุมัติ',
        { isOvertime: true, isDayOffOvertime: true, inPremises, address },
      );
    } else if (dayOffOvertimeRequest?.status === 'pending') {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาทำงานล่วงเวลาในวันหยุด (คำขออยู่ระหว่างการพิจารณา)',
        {
          isOvertime: true,
          isPendingDayOffOvertime: true,
          inPremises,
          address,
        },
      );
    }
    return this.createResponse(
      false,
      'วันหยุด: การลงเวลาจะต้องได้รับการอนุมัติ',
      { inPremises, address },
    );
  }

  private handleHalfDayLeave(
    leaveRequest: LeaveRequest,
    now: Date,
    shiftStart: Date,
    shiftEnd: Date,
    isCheckingIn: boolean,
    inPremises: boolean,
    address: string,
  ): CheckInOutAllowance {
    const shiftMidpoint = new Date(
      (shiftStart.getTime() + shiftEnd.getTime()) / 2,
    );

    const isMorningLeave = leaveRequest.startDate < shiftMidpoint;
    const isSecondHalfOfShift = now >= shiftMidpoint;

    if (isMorningLeave) {
      if (isCheckingIn) {
        if (isSecondHalfOfShift) {
          return this.createResponse(
            true,
            'คุณสามารถลงเวลาเข้างานสำหรับช่วงที่สองของกะได้',
            { inPremises, address },
          );
        } else {
          return this.createResponse(
            false,
            'คุณอยู่ในช่วงลาครึ่งแรกของกะ กรุณาลงเวลาเข้างานในช่วงที่สองของกะ',
            { inPremises, address },
          );
        }
      } else {
        if (isSecondHalfOfShift) {
          return this.createResponse(true, 'คุณสามารถลงเวลาออกงานได้', {
            inPremises,
            address,
          });
        } else {
          return this.createResponse(
            false,
            'คุณอยู่ในช่วงลาครึ่งแรกของกะ ยังไม่สามารถลงเวลาออกได้',
            { inPremises, address },
          );
        }
      }
    } else {
      // Afternoon (second half) leave
      if (isCheckingIn) {
        if (isSecondHalfOfShift) {
          return this.createResponse(
            false,
            'คุณอยู่ในช่วงลาครึ่งหลังของกะ ไม่สามารถลงเวลาเข้างานได้',
            { inPremises, address },
          );
        } else {
          return this.createResponse(
            true,
            'คุณสามารถลงเวลาเข้างานสำหรับช่วงแรกของกะได้',
            { inPremises, address },
          );
        }
      } else {
        if (isSecondHalfOfShift) {
          return this.createResponse(
            false,
            'คุณอยู่ในช่วงลาครึ่งหลังของกะ ไม่สามารถลงเวลาออกได้',
            { inPremises, address },
          );
        } else {
          return this.createResponse(
            true,
            'คุณสามารถลงเวลาออกงานสำหรับช่วงแรกของกะได้',
            { inPremises, address },
          );
        }
      }
    }
  }

  private handleApprovedOvertime(
    approvedOvertime: any,
    now: Date,
    inPremises: boolean,
    address: string,
  ): CheckInOutAllowance | null {
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
    );
    const overtimeEnd = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
    );
    if (now >= overtimeStart && now <= overtimeEnd) {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาในช่วงทำงานล่วงเวลาที่ได้รับอนุมัติ',
        { isOvertime: true, inPremises, address },
      );
    }
    return null;
  }

  private handleCheckIn(
    now: Date,
    earlyCheckInWindow: Date,
    shiftStart: Date,
    isLate: boolean,
    inPremises: boolean,
    address: string,
  ): CheckInOutAllowance {
    if (now < earlyCheckInWindow) {
      const minutesUntilAllowed = Math.ceil(
        differenceInMinutes(earlyCheckInWindow, now),
      );
      return this.createResponse(
        false,
        `คุณกำลังเข้างานก่อนเวลาโดยไม่ได้รับการอนุมัติ กรุณารอ ${minutesUntilAllowed} นาทีเพื่อเข้างาน`,
        { countdown: minutesUntilAllowed, inPremises, address },
      );
    }
    if (isAfter(now, earlyCheckInWindow) && isBefore(now, shiftStart)) {
      return this.createResponse(
        true,
        'คุณกำลังเข้างานก่อนเวลา ระบบจะบันทึกเวลาเข้างานตามกะการทำงาน',
        { isOvertime: false, inPremises, address },
      );
    }
    if (isLate) {
      return this.createResponse(true, 'คุณกำลังลงเวลาเข้างานสาย', {
        isLate: true,
        isOvertime: false,
        inPremises,
        address,
      });
    }
    return this.createResponse(true, 'คุณกำลังลงเวลาเข้างาน', {
      isLate: false,
      isOvertime: false,
      inPremises,
      address,
    });
  }

  private async handleCheckOut(
    now: Date,
    shiftEnd: Date,
    approvedOvertime: any,
    pendingOvertime: any,
    inPremises: boolean,
    address: string,
  ): Promise<CheckInOutAllowance> {
    if (approvedOvertime) {
      const isOvertime = this.isOvertimeCheckOut(
        now,
        shiftEnd,
        approvedOvertime,
      );
      if (isOvertime) {
        return this.createResponse(
          true,
          'คุณกำลังลงเวลาออกงาน (ทำงานล่วงเวลาที่ได้รับอนุมัติ)',
          { isOvertime: true, inPremises, address },
        );
      }
    }

    if (pendingOvertime) {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาออกงาน (คำขอทำงานล่วงเวลาอยู่ระหว่างการพิจารณา)',
        { isPendingOvertime: true, inPremises, address },
      );
    }

    const isLateCheckOut = isAfter(now, addMinutes(shiftEnd, 15)); // 15 minutes grace period

    if (isLateCheckOut) {
      return this.createResponse(true, 'คุณกำลังลงเวลาออกงานช้า', {
        isLate: true,
        inPremises,
        address,
      });
    }

    return this.createResponse(true, 'คุณกำลังลงเวลาออกงาน', {
      inPremises,
      address,
    });
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
          if (isOvertime && approvedOvertimeRequest) {
            await this.overtimeService.updateOvertimeActualEndTime(
              approvedOvertimeRequest.id,
              parsedCheckTime,
            );
          }
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
        isCheckIn,
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
        const overtimeStart = approvedOvertimeRequest.startTime;
        const overtimeEnd = approvedOvertimeRequest.endTime;
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
    console.log(`Is holiday: ${isHoliday}`);
    const leaveRequests = await this.leaveService.getLeaveRequests(employeeId);
    console.log(`Leave requests: ${JSON.stringify(leaveRequests)}`);
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
    console.log(`Pending leave request: ${pendingLeaveRequest}`);

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
    let historicalIsLateCheckIn = false;

    const isDayOff = isHoliday || !shift.workDays.includes(now.getDay());
    const shiftStart = this.parseShiftTime(shift.startTime, now);
    const shiftEnd = this.parseShiftTime(shift.endTime, now);

    if (attendance && attendance.checkInTime) {
      isCheckingIn = false;
      historicalIsLateCheckIn = isAfter(attendance.checkInTime, shiftStart);
      isEarlyCheckIn = isBefore(attendance.checkInTime, shiftStart);
      isLateCheckIn = isAfter(attendance.checkInTime, shiftStart);

      if (attendance.checkOutTime) {
        status = 'present';
        isLateCheckOut = isAfter(attendance.checkOutTime, shiftEnd);
      } else {
        status = 'incomplete';
        isLateCheckOut = isAfter(now, shiftEnd);
      }

      if (approvedOvertime && isSameDay(now, approvedOvertime.date)) {
        const overtimeStart = approvedOvertime.startTime;
        const overtimeEnd = approvedOvertime.endTime;
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
      isCheckingIn,
      isEarlyCheckIn,
      isLateCheckIn,
      combinedLateCheckOut,
      isOvertime,
    );

    return {
      status,
      isCheckingIn,
      isOvertime,
      overtimeDuration,
      detailedStatus,
      isEarlyCheckIn,
      isLateCheckIn: isCheckingIn ? isLateCheckIn : historicalIsLateCheckIn,
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

      let processedAttendance = this.processAttendanceRecord(attendance, shift);

      // Override status based on holiday or leave
      if (isHoliday) {
        processedAttendance.status = 'holiday';
      } else if (leaveRequest) {
        processedAttendance.status = 'off';
      }

      // Update overtime information if there's an approved overtime request
      if (overtimeRequest) {
        processedAttendance.isOvertime = true;
        processedAttendance.overtimeHours = this.calculateOvertimeHours(
          parseISO(`${format(date, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`),
          parseISO(
            `${format(date, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
          ),
        );
      }
      const isCheckingIn = processedAttendance.checkOut === undefined;

      processedAttendance.detailedStatus = this.generateDetailedStatus(
        processedAttendance.status,
        isCheckingIn,
        processedAttendance.isEarlyCheckIn || false,
        processedAttendance.isLateCheckIn || false,
        processedAttendance.isLateCheckOut || false,
        processedAttendance.isOvertime || false,
      );

      return processedAttendance;
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
    const isCheckingIn = !attendance.checkOutTime;

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
      isOvertime,
      detailedStatus: this.generateDetailedStatus(
        status,
        isCheckingIn,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        isOvertime,
      ),
      overtimeDuration: overtimeHours,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut,
      isManualEntry: attendance.isManualEntry,
      attendanceStatusType: this.mapStatusToAttendanceStatusType(
        status,
        isCheckingIn,
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

  private calculateOvertimeHours(checkOutTime: Date, shiftEnd: Date): number {
    if (isAfter(checkOutTime, shiftEnd)) {
      return Math.max(0, differenceInMinutes(checkOutTime, shiftEnd) / 60);
    }
    return 0;
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

    // Handle overnight shifts
    if (
      isAfter(shiftEnd, shiftStart) ||
      isAfter(effectiveEnd, effectiveStart)
    ) {
      return Math.max(
        0,
        differenceInMinutes(effectiveEnd, effectiveStart) / 60,
      );
    } else {
      // For overnight shifts, add a day to the end time
      const adjustedEffectiveEnd = addDays(effectiveEnd, 1);
      return Math.max(
        0,
        differenceInMinutes(adjustedEffectiveEnd, effectiveStart) / 60,
      );
    }
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
    isCheckingIn: boolean,
    isEarlyCheckIn: boolean,
    isLateCheckIn: boolean,
    isLateCheckOut: boolean,
    isOvertime: boolean,
  ): string {
    if (
      status !== 'present' &&
      status !== 'incomplete' &&
      status !== 'overtime'
    )
      return status;

    const details: string[] = [];
    if (isCheckingIn) {
      // This block won't be executed for check-out, but we'll keep it for completeness
      if (isEarlyCheckIn) details.push('early-check-in');
      if (isLateCheckIn) details.push('late-check-in');
    } else {
      // Check-out specific statuses
      if (isLateCheckOut) details.push('late-check-out');
      if (isOvertime) details.push('overtime');
    }

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
        ? approvedOvertime.endTime
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

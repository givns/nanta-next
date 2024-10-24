//AttendanceService.ts
import {
  PrismaClient,
  Prisma,
  Attendance,
  User,
  LeaveRequest,
  TimeEntry as PrismaTimeEntry,
  OvertimeEntry as PrismaOvertimeEntry,
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
  addHours,
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
  OvertimeEntryData,
  LateCheckOutStatus,
  AttendanceRecord,
  HalfDayLeaveContext,
} from '../types/attendance';
import { UserData } from '../types/user';
import { NotificationService } from './NotificationService';
import { UserRole } from '../types/enum';
import { TimeEntryService } from './TimeEntryService';
import { getCurrentTime } from '../utils/dateUtils';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../lib/serverCache';
import { ErrorCode, AppError } from '../types/errors';
import { cacheService } from './CacheService';

const USER_CACHE_TTL = 72 * 60 * 60; // 24 hours
const ATTENDANCE_CACHE_TTL = 30 * 60; // 30 minutes
const EARLY_CHECK_IN_THRESHOLD = 29; // 29 minutes before shift start
const LATE_CHECK_IN_THRESHOLD = 5; // 5 minutes after shift start
const LATE_CHECK_OUT_THRESHOLD = 15; // 15 minutes after shift end
const EARLY_CHECK_OUT_THRESHOLD = 15; // 15 minutes before shift end

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
      const today = startOfDay(now);

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
        today,
        await this.holidayService.getHolidays(today, today), // Get holidays for today
        user.shiftCode === 'SHIFT104',
      );

      if (isHoliday) {
        return this.createResponse(
          false,
          'วันนี้เป็นวันหยุดนักขัตฤกษ์ ไม่สามารถลงเวลาได้',
          { inPremises, address },
        );
      }

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
        this.overtimeService.getApprovedOvertimeRequest(employeeId, today),
        this.overtimeService.getPendingOvertimeRequests(employeeId, today),
        this.leaveService.checkUserOnLeave(employeeId, today),
        this.leaveService.hasPendingLeaveRequest(employeeId, today),
        this.getLatestAttendance(employeeId),
      ]);

      console.log('Attendance data:', {
        isOutsideShift,
        isLate,
        isOvertime,
        isHoliday,
        isDayOff,
        approvedOvertime,
        pendingOvertime,
        leaveRequest,
        pendingLeave,
        latestAttendance,
      });

      const dayOffOvertimeRequest = isDayOff
        ? await this.overtimeService.getDayOffOvertimeRequest(employeeId, now)
        : null;

      // 4. Calculate time-related variables
      const shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
      const shiftEnd = this.parseShiftTime(effectiveShift.endTime, now);
      const earlyCheckInWindow = subMinutes(
        shiftStart,
        EARLY_CHECK_IN_THRESHOLD,
      );
      const earlyCheckOutWindow = addMinutes(
        shiftEnd,
        EARLY_CHECK_OUT_THRESHOLD,
      );
      const isCheckingIn =
        !latestAttendance || !latestAttendance.regularCheckInTime;
      const isLateCheckIn = isCheckingIn && isLate;

      // 5. Check various scenarios
      if (!inPremises) {
        return this.createResponse(
          false,
          'ไม่สามารถลงเวลาได้เนื่องจากอยู่นอกสถานที่ทำงาน',
          { inPremises, address, isOutsideShift },
        );
      }

      if (isDayOff) {
        return this.handleDayOffScenario(
          dayOffOvertimeRequest,
          approvedOvertime,
          inPremises,
          address,
          now,
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
          isLateCheckIn,
          inPremises,
          address,
          leaveRequest ? [leaveRequest] : [],
          latestAttendance,
        );
      } else {
        return this.handleCheckOut(
          now,
          earlyCheckOutWindow,
          shiftEnd,
          approvedOvertime,
          pendingOvertime,
          inPremises,
          address,
          leaveRequest ? [leaveRequest] : [],
          effectiveShift,
          latestAttendance,
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
      isAfternoonShift: options.isAfternoonShift ?? false,
      ...options,
    };
  }

  private handleDayOffScenario(
    dayOffOvertimeRequest: any,
    approvedOvertime: any,
    inPremises: boolean,
    address: string,
    now: Date,
  ): CheckInOutAllowance {
    if (approvedOvertime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
      );

      if (now >= overtimeStart && now <= overtimeEnd) {
        return this.createResponse(
          true,
          'คุณกำลังลงเวลาทำงานล่วงเวลาในวันหยุดที่ได้รับอนุมัติ',
          { isOvertime: true, isDayOffOvertime: true, inPremises, address },
        );
      } else {
        return this.createResponse(
          false,
          'คุณมีการอนุมัติทำงานล่วงเวลาในวันหยุด แต่ไม่อยู่ในช่วงเวลาที่ได้รับอนุมัติ',
          { inPremises, address },
        );
      }
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

  private handleApprovedOvertime(
    approvedOvertime: ApprovedOvertime,
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

  private determineHalfDayLeaveContext(
    leaveRequests: LeaveRequest[],
    latestAttendance: AttendanceRecord | null,
    now: Date,
    shiftMidpoint: Date,
  ): HalfDayLeaveContext {
    const halfDayLeave = leaveRequests.find(
      (leave) =>
        leave.status === 'Approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(new Date(leave.startDate), now),
    );

    const checkInTime = latestAttendance?.regularCheckInTime
      ? new Date(latestAttendance.regularCheckInTime)
      : null;

    return {
      hasHalfDayLeave: !!halfDayLeave,
      checkInTime,
      // Morning leave is confirmed if they try to check in after midpoint with no previous check-in
      isMorningLeaveConfirmed:
        !!halfDayLeave && !checkInTime && isAfter(now, shiftMidpoint),
      // Afternoon leave is confirmed if they checked in before midpoint and try to leave around midpoint
      isAfternoonLeaveConfirmed:
        !!halfDayLeave && !!checkInTime && isBefore(checkInTime, shiftMidpoint),
    };
  }

  private handleCheckIn(
    now: Date,
    earlyCheckInWindow: Date,
    shiftStart: Date,
    isLate: boolean,
    inPremises: boolean,
    address: string,
    leaveRequests: LeaveRequest[] = [],
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    console.log('HandleCheckIn parameters:', {
      now: now.toISOString(),
      shiftStart: shiftStart.toISOString(),
      isLate,
      hasLeaveRequests: leaveRequests.length > 0,
    });

    const shiftEnd = addHours(shiftStart, 8);
    const shiftMidpoint = new Date(
      shiftStart.getTime() + (shiftEnd.getTime() - shiftStart.getTime()) / 2,
    );

    // Get half-day leave context
    const leaveContext = this.determineHalfDayLeaveContext(
      leaveRequests,
      latestAttendance,
      now,
      shiftMidpoint,
    );

    console.log('Half-day leave context:', leaveContext);

    // Handle morning leave confirmation
    if (leaveContext.isMorningLeaveConfirmed) {
      return this.createResponse(true, 'คุณกำลังลงเวลาเข้างานช่วงบ่าย', {
        inPremises,
        address,
        isAfternoonShift: true,
        isLateCheckIn: false,
        isLate: false,
      });
    }

    // Too late check
    const minutesLate = differenceInMinutes(now, shiftStart);
    if (minutesLate > 240 && !leaveContext.hasHalfDayLeave) {
      return this.createResponse(
        false,
        'ไม่สามารถลงเวลาได้เนื่องจากสายเกิน 4 ชั่วโมง กรุณาติดต่อฝ่ายบุคคล',
        {
          inPremises,
          address,
          isLate: true,
          requireConfirmation: true,
          isAfternoonShift: false,
        },
      );
    }

    // Check for too early
    if (now < earlyCheckInWindow) {
      const minutesUntilAllowed = Math.ceil(
        differenceInMinutes(earlyCheckInWindow, now),
      );
      return this.createResponse(
        false,
        `คุณกำลังเข้างานก่อนเวลาโดยไม่ได้รับการอนุมัติ กรุณารอ ${minutesUntilAllowed} นาทีเพื่อเข้างาน`,
        {
          countdown: minutesUntilAllowed,
          inPremises,
          address,
          isAfternoonShift: false,
        },
      );
    }

    // Early but acceptable check-in
    if (isAfter(now, earlyCheckInWindow) && isBefore(now, shiftStart)) {
      return this.createResponse(
        true,
        'คุณกำลังเข้างานก่อนเวลา ระบบจะบันทึกเวลาเข้างานตามกะการทำงาน',
        {
          isEarlyCheckIn: true,
          inPremises,
          address,
          isAfternoonShift: false,
        },
      );
    }

    // Late check-in
    if (isLate && !leaveContext.hasHalfDayLeave) {
      return this.createResponse(true, 'คุณกำลังลงเวลาเข้างานสาย', {
        isLateCheckIn: true,
        inPremises,
        address,
        isAfternoonShift: false,
      });
    }

    // Normal check-in
    return this.createResponse(true, 'คุณกำลังลงเวลาเข้างาน', {
      inPremises,
      address,
      isAfternoonShift: false,
      isLate: false,
    });
  }

  private handleCheckOut(
    now: Date,
    earlyCheckOutWindow: Date,
    shiftEnd: Date,
    approvedOvertime: ApprovedOvertime | null,
    pendingOvertime: any,
    inPremises: boolean,
    address: string,
    leaveRequests: LeaveRequest[],
    effectiveShift: ShiftData,
    latestAttendance: AttendanceRecord | null,
  ): CheckInOutAllowance {
    // Already checked out
    if (latestAttendance?.regularCheckOutTime) {
      return this.createResponse(false, 'คุณได้ลงเวลาออกงานแล้ว', {
        inPremises,
        address,
      });
    }

    const shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
    const shiftMidpoint = new Date(
      (shiftStart.getTime() + shiftEnd.getTime()) / 2,
    );

    // Get half-day leave context
    const leaveContext = this.determineHalfDayLeaveContext(
      leaveRequests,
      latestAttendance,
      now,
      shiftMidpoint,
    );

    // Handle afternoon leave confirmation
    if (
      leaveContext.hasHalfDayLeave &&
      leaveContext.checkInTime &&
      isBefore(leaveContext.checkInTime, shiftMidpoint) &&
      isWithinInterval(now, {
        start: subMinutes(shiftMidpoint, 30),
        end: addMinutes(shiftMidpoint, 30),
      })
    ) {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาออกงานสำหรับช่วงเช้า เนื่องจากมีการลาช่วงบ่าย',
        {
          inPremises,
          address,
          isMorningShift: true,
          isApprovedEarlyCheckout: true,
        },
      );
    }

    // Handle morning leave (checked in after midpoint)
    if (leaveContext.isMorningLeaveConfirmed) {
      // Allow normal end-of-day checkout
      if (
        isWithinInterval(now, {
          start: subMinutes(shiftEnd, 15),
          end: addMinutes(shiftEnd, 30),
        })
      ) {
        return this.createResponse(true, 'คุณกำลังลงเวลาออกงานสำหรับช่วงบ่าย', {
          inPremises,
          address,
          isAfternoonShift: true,
        });
      }
    }

    // Early checkout for non-leave cases
    if (now < earlyCheckOutWindow && !leaveContext.hasHalfDayLeave) {
      return this.createResponse(
        true,
        'คุณกำลังจะลงเวลาออกก่อนเวลาเลิกงาน หากคุณต้องการลาป่วยฉุกเฉิน ระบบจะทำการยื่นคำขอลาป่วยเต็มวันให้อัตโนมัติ',
        {
          inPremises,
          address,
          requireConfirmation: true,
          isEarlyCheckOut: true,
        },
      );
    }

    // Handle overtime
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

    // Handle pending overtime
    if (pendingOvertime) {
      return this.createResponse(
        true,
        'คุณกำลังลงเวลาออกงาน (คำขอทำงานล่วงเวลาอยู่ระหว่างการพิจารณา)',
        { isPendingOvertime: true, inPremises, address },
      );
    }

    // Regular late check-out
    const isLateCheckOut = isAfter(
      now,
      addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
    );
    if (isLateCheckOut) {
      return this.createResponse(true, 'คุณกำลังลงเวลาออกงานช้า', {
        isLateCheckOut: true,
        inPremises,
        address,
      });
    }

    // Normal check-out
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
        const user = await this.prisma.user.findUnique({
          where: { lineUserId: attendanceData.lineUserId },
        });
        if (user) {
          attendanceData.employeeId = user.employeeId;
        }
      }

      if (!attendanceData.employeeId) {
        throw new Error('Employee ID is required');
      }

      const user = await this.getCachedUserData(attendanceData.employeeId);
      if (!user) {
        throw new Error('User not found');
      }

      const { isCheckIn, checkTime } = attendanceData;
      let parsedCheckTime = new Date(checkTime);
      let attendanceDate = startOfDay(parsedCheckTime);
      if (!isCheckIn && parsedCheckTime.getHours() < 4) {
        attendanceDate = subDays(attendanceDate, 1);
      }

      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          user.employeeId,
          attendanceDate,
        );
      if (!shiftData || !shiftData.effectiveShift) {
        throw new Error('Effective shift not found');
      }

      const { effectiveShift } = shiftData;
      const shiftStart = this.parseShiftTime(
        effectiveShift.startTime,
        attendanceDate,
      );
      const shiftEnd = this.parseShiftTime(
        effectiveShift.endTime,
        attendanceDate,
      );
      const isOvernightShift = this.isOvernightShift(shiftStart, shiftEnd);
      if (isOvernightShift) {
        parsedCheckTime = this.adjustDateForOvernightShift(
          parsedCheckTime,
          isCheckIn,
          shiftStart,
          shiftEnd,
        );
      }
      const isHoliday = await this.holidayService.isHoliday(
        attendanceDate,
        [],
        user.shiftCode === 'SHIFT104',
      );
      const leaveRequest = await this.leaveService.checkUserOnLeave(
        user.employeeId,
        attendanceDate,
      );
      const approvedOvertimeRequest =
        await this.overtimeService.getApprovedOvertimeRequest(
          user.employeeId,
          attendanceDate,
        );

      let status: AttendanceStatusValue = 'absent';
      let isOvertime = false;
      let isEarlyCheckIn = false;
      let isLateCheckIn = false;
      let isLateCheckOut = false;

      const existingAttendance = await this.getLatestAttendance(
        user.employeeId,
      );

      if (isHoliday) {
        status = 'holiday';
      } else if (leaveRequest && leaveRequest.status === 'approved') {
        status = 'off';
      } else {
        if (isCheckIn) {
          if (existingAttendance && existingAttendance.regularCheckInTime) {
            throw new Error('Already checked in for today');
          }
          status = 'incomplete';
          isEarlyCheckIn = isBefore(parsedCheckTime, shiftStart);
          isLateCheckIn = isAfter(
            parsedCheckTime,
            addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD),
          );
          isLateCheckOut = false; // Reset late check-out
        } else {
          // Check-out
          if (!existingAttendance || !existingAttendance.regularCheckInTime) {
            throw new Error('Cannot check out without checking in first');
          }

          const checkOutTime = parsedCheckTime;
          isLateCheckOut = isAfter(
            checkOutTime,
            addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
          );
          isLateCheckIn = existingAttendance.isLateCheckIn ?? false;

          if (approvedOvertimeRequest) {
            const overtimeStart = parseISO(approvedOvertimeRequest.startTime);

            if (isAfter(parsedCheckTime, overtimeStart)) {
              isOvertime = true;
              status = 'overtime';
            } else {
              status = 'present';
            }
          } else if (isAfter(parsedCheckTime, shiftEnd)) {
            status = 'present';
            isOvertime = true;
          } else {
            status = 'present';
          }
        }
      }

      const attendanceRecord = await this.updateOrCreateAttendanceRecord(
        user.employeeId,
        attendanceDate,
        parsedCheckTime,
        isCheckIn,
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
      );

      const timeEntry = await this.timeEntryService.createOrUpdateTimeEntry(
        attendanceRecord,
        isCheckIn,
        approvedOvertimeRequest,
      );

      const detailedStatus = this.generateDetailedStatus(
        status,
        isCheckIn,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut,
        isOvertime,
        this.isOvernightShift(shiftStart, shiftEnd),
        existingAttendance,
      );

      const processedAttendance: ProcessedAttendance = {
        id: attendanceRecord.id,
        employeeId: attendanceData.employeeId,
        date: attendanceDate,
        status,
        regularHours: timeEntry.regularHours,
        overtimeHours: timeEntry.overtimeHours,
        detailedStatus,
        attendanceStatusType: this.mapStatusToAttendanceStatusType(
          status,
          isCheckIn,
          isOvertime,
        ),
      };

      await this.invalidateAttendanceCache(attendanceData.employeeId);
      await this.shiftManagementService.invalidateShiftCache(
        attendanceData.employeeId,
      );

      console.log('Processed attendance:', JSON.stringify(processedAttendance));
      return processedAttendance;
    } catch (error) {
      console.error('Error in processAttendance:', error);
      throw new Error(
        `Error processing attendance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async processCheckInOut(
    employeeId: string,
    timestamp: Date,
    isCheckIn: boolean,
    isOvertime: boolean,
  ) {
    const attendance = await this.getOrCreateAttendanceForDate(
      employeeId,
      timestamp,
    );

    if (isOvertime) {
      await this.overtimeService.processOvertimeCheckInOut(
        attendance,
        timestamp,
        isCheckIn,
      );
    } else {
      await this.processRegularCheckInOut(attendance, timestamp, isCheckIn);
    }

    // Update attendance after processing check in/out
    await this.updateAttendance(attendance);

    // Create or update time entry
    const approvedOvertimeRequest =
      await this.overtimeService.getApprovedOvertimeRequest(
        employeeId,
        timestamp,
      );

    await this.timeEntryService.createOrUpdateTimeEntry(
      attendance,
      isCheckIn,
      approvedOvertimeRequest,
    );
  }

  private async processRegularCheckInOut(
    attendance: AttendanceRecord,
    timestamp: Date,
    isCheckIn: boolean,
  ): Promise<AttendanceRecord> {
    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        attendance.employeeId,
        attendance.date,
      );

    if (!shiftData?.effectiveShift) {
      throw new Error('Effective shift not found');
    }

    const { effectiveShift } = shiftData;
    const shiftStart = this.parseShiftTime(
      effectiveShift.startTime,
      attendance.date,
    );
    const shiftEnd = this.parseShiftTime(
      effectiveShift.endTime,
      attendance.date,
    );

    // Calculate late status first
    let lateStatus = {
      isLateCheckOut: false,
      isVeryLateCheckOut: false,
      minutesLate: 0,
    };

    if (!isCheckIn) {
      lateStatus = this.calculateLateCheckOutStatus(timestamp, shiftEnd);
    }

    // Prepare update data
    const updateData: Prisma.AttendanceUpdateInput = {
      regularCheckInTime: isCheckIn ? timestamp : undefined,
      regularCheckOutTime: !isCheckIn ? timestamp : undefined,
      isEarlyCheckIn: isCheckIn
        ? this.isEarlyCheckIn(timestamp, shiftStart)
        : undefined,
      isLateCheckIn: isCheckIn
        ? this.isLateCheckIn(timestamp, shiftStart)
        : undefined,
      ...(!isCheckIn && {
        isLateCheckOut: lateStatus.isLateCheckOut,
        isVeryLateCheckOut: lateStatus.isVeryLateCheckOut,
        lateCheckOutMinutes: lateStatus.minutesLate,
      }),
      status: this.calculateAttendanceStatus(attendance, effectiveShift),
    };

    const updatedAttendance = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: updateData,
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    return this.toAttendanceRecord(updatedAttendance);
  }

  private calculateAttendanceStatus(
    attendance: AttendanceRecord,
    shift: ShiftData,
  ): AttendanceStatusValue {
    if (!attendance.regularCheckInTime) return 'absent';
    if (!attendance.regularCheckOutTime) return 'incomplete';

    const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);
    const isOvertime = isAfter(attendance.regularCheckOutTime, shiftEnd);

    if (isOvertime) return 'overtime';
    return 'present';
  }

  private isLateCheckIn(timestamp: Date, shiftStart: Date): boolean {
    return isAfter(timestamp, addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD));
  }

  private isEarlyCheckIn(timestamp: Date, shiftStart: Date): boolean {
    return isBefore(
      timestamp,
      subMinutes(shiftStart, EARLY_CHECK_IN_THRESHOLD),
    );
  }

  private isLateCheckOut(timestamp: Date, shiftEnd: Date): boolean {
    return isAfter(timestamp, addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD));
  }

  private isOvertimeCheckOut(
    checkOutTime: Date,
    shiftEnd: Date,
    approvedOvertimeRequest: ApprovedOvertime | null,
  ): boolean {
    if (isAfter(checkOutTime, shiftEnd)) {
      if (approvedOvertimeRequest) {
        const overtimeStart = parseISO(
          `${format(checkOutTime, 'yyyy-MM-dd')}T${approvedOvertimeRequest.startTime}`,
        );
        const overtimeEnd = parseISO(
          `${format(checkOutTime, 'yyyy-MM-dd')}T${approvedOvertimeRequest.endTime}`,
        );
        return isWithinInterval(checkOutTime, {
          start: overtimeStart,
          end: overtimeEnd,
        });
      }
      return true; // Consider it overtime even without approval, but it might be flagged differently
    }
    return false;
  }

  private toAttendanceRecord(
    attendance: Attendance & {
      overtimeEntries: PrismaOvertimeEntry[];
      timeEntries: PrismaTimeEntry[];
    },
  ): AttendanceRecord {
    return {
      ...attendance,
      overtimeEntries: attendance.overtimeEntries.map((entry) => ({
        id: entry.id,
        attendanceId: entry.attendanceId,
        overtimeRequestId: entry.overtimeRequestId,
        actualStartTime: entry.actualStartTime,
        actualEndTime: entry.actualEndTime,
      })),
      timeEntries: attendance.timeEntries,
    };
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
  ): Promise<Attendance> {
    try {
      const existingAttendance = await this.prisma.attendance.findFirst({
        where: {
          employeeId,
          date: {
            gte: startOfDay(date),
            lt: endOfDay(date),
          },
        },
      });

      const shiftData =
        await this.shiftManagementService.getEffectiveShiftAndStatus(
          employeeId,
          date,
        );

      if (!shiftData?.effectiveShift) {
        throw new Error('Effective shift not found');
      }

      if (existingAttendance) {
        const updateData: Prisma.AttendanceUncheckedUpdateInput = {
          [isCheckIn ? 'regularCheckInTime' : 'regularCheckOutTime']: checkTime,
          status,
          isEarlyCheckIn,
          isLateCheckIn,
          isLateCheckOut,
        };

        return this.prisma.attendance.update({
          where: { id: existingAttendance.id },
          data: updateData,
        });
      } else {
        const createData: Prisma.AttendanceUncheckedCreateInput = {
          employeeId,
          date: startOfDay(date),
          [isCheckIn ? 'regularCheckInTime' : 'regularCheckOutTime']: checkTime,
          status,
          isEarlyCheckIn,
          isLateCheckIn,
          isLateCheckOut,
          isDayOff: !shiftData.effectiveShift.workDays.includes(date.getDay()),
          shiftStartTime: this.parseShiftTime(
            shiftData.effectiveShift.startTime,
            date,
          ),
          shiftEndTime: this.parseShiftTime(
            shiftData.effectiveShift.endTime,
            date,
          ),
        };

        return this.prisma.attendance.create({
          data: createData,
        });
      }
    } catch (error) {
      console.error('Error in updateOrCreateAttendanceRecord:', error);
      throw new Error(
        `Failed to update/create attendance record: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async getLatestAttendance(
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
      orderBy: { date: 'desc' },
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    return attendance ? this.toAttendanceRecord(attendance) : null;
  }

  private async updateAttendance(
    attendance: Attendance,
  ): Promise<AttendanceRecord> {
    const timeEntry = await this.timeEntryService.createOrUpdateTimeEntry(
      attendance,
      false,
      null,
    );

    const updatedAttendance = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        status: attendance.status,
      },
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    return this.toAttendanceRecord(updatedAttendance);
  }

  async getOrCreateAttendanceForDate(
    employeeId: string,
    date: Date,
  ): Promise<AttendanceRecord> {
    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
      },
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    if (existingAttendance) {
      return this.toAttendanceRecord(existingAttendance);
    }

    const shiftData =
      await this.shiftManagementService.getEffectiveShiftAndStatus(
        employeeId,
        date,
      );
    if (!shiftData?.effectiveShift) {
      throw new Error('Effective shift not found');
    }

    const createData: Prisma.AttendanceUncheckedCreateInput = {
      employeeId,
      date: startOfDay(date),
      isDayOff: !shiftData.effectiveShift.workDays.includes(date.getDay()),
      shiftStartTime: this.parseShiftTime(
        shiftData.effectiveShift.startTime,
        date,
      ),
      shiftEndTime: this.parseShiftTime(shiftData.effectiveShift.endTime, date),
      status: 'absent',
    };

    const newAttendance = await this.prisma.attendance.create({
      data: createData,
      include: {
        overtimeEntries: true,
        timeEntries: true,
      },
    });

    return this.toAttendanceRecord(newAttendance);
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
        JSON.stringify({ ...status, timestamp: Date.now() }),
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
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
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
    attendance: AttendanceRecord | null,
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

    if (approvedOvertime && isSameDay(now, approvedOvertime.date)) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
      );

      if (now >= overtimeStart && now <= overtimeEnd) {
        status = 'overtime';
        isOvertime = true;
      }
    }

    if (attendance && attendance.regularCheckInTime) {
      isCheckingIn = false;
      historicalIsLateCheckIn = isAfter(
        attendance.regularCheckInTime,
        addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD),
      );
      isEarlyCheckIn = isBefore(
        attendance.regularCheckInTime,
        subMinutes(shiftStart, EARLY_CHECK_IN_THRESHOLD),
      );
      isLateCheckIn = historicalIsLateCheckIn;

      if (attendance.regularCheckOutTime) {
        status = isOvertime ? 'overtime' : 'present';
        isLateCheckOut = isAfter(
          attendance.regularCheckOutTime,
          addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
        );
      } else {
        status = 'incomplete';
        isLateCheckOut = isAfter(
          now,
          addMinutes(shiftEnd, LATE_CHECK_OUT_THRESHOLD),
        );
      }

      if (isOvertime && approvedOvertime) {
        const overtimeStart = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
        );
        const overtimeEnd = parseISO(
          `${format(now, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
        );
        const effectiveStart = max([
          attendance.regularCheckInTime,
          overtimeStart,
        ]);
        const effectiveEnd = attendance.regularCheckOutTime
          ? min([attendance.regularCheckOutTime, overtimeEnd])
          : now;

        overtimeDuration =
          differenceInMinutes(effectiveEnd, effectiveStart) / 60;
      }
    }

    if (isDayOff && !isOvertime) {
      status = 'off';
      isCheckingIn = true;
    } else if (leaveRequest && leaveRequest.status === 'approved') {
      status = 'off';
      isCheckingIn = true;
    } else if (isHoliday && !isOvertime) {
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
      this.isOvernightShift(shiftStart, shiftEnd),
      attendance,
    );

    const overtimeEntries: OvertimeEntryData[] =
      attendance?.overtimeEntries.map((entry) => ({
        ...entry,
        createdAt: new Date(),
        updatedAt: new Date(),
      })) || [];

    return {
      status,
      isCheckingIn,
      isOvertime,
      overtimeDuration,
      overtimeEntries,
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
            checkInTime: attendance.regularCheckInTime
              ? format(attendance.regularCheckInTime, 'HH:mm:ss')
              : null,
            checkOutTime: attendance.regularCheckOutTime
              ? format(attendance.regularCheckOutTime, 'HH:mm:ss')
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
      shiftAdjustment: null,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      pendingLeaveRequest,
    };
  }

  private calculateLateCheckOutStatus(
    checkOutTime: Date,
    shiftEnd: Date,
  ): LateCheckOutStatus {
    const LATE_THRESHOLD = 15; // 15 minutes
    const VERY_LATE_THRESHOLD = 30; // 30 minutes

    const minutesLate = differenceInMinutes(checkOutTime, shiftEnd);

    return {
      isLateCheckOut: minutesLate > LATE_THRESHOLD,
      isVeryLateCheckOut: minutesLate > VERY_LATE_THRESHOLD,
      minutesLate: Math.max(0, minutesLate),
    };
  }

  private mapStatusToAttendanceStatusType(
    status: AttendanceStatusValue,
    isCheckingIn: boolean,
    isOvertime: boolean,
  ): AttendanceStatusType {
    switch (status) {
      case 'absent':
        return 'pending';
      case 'incomplete':
        return 'checked-in';
      case 'present':
        return isOvertime ? 'overtime-ended' : 'checked-out';
      case 'overtime':
        return isCheckingIn ? 'overtime-started' : 'overtime-ended';
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
    isOvernightShift: boolean,
    latestAttendance: Attendance | null,
  ): string {
    if (status === 'holiday' || status === 'off') return status;

    const details: string[] = [];

    // Check if this is the first check-in of the day
    if (
      latestAttendance?.regularCheckInTime &&
      latestAttendance?.shiftStartTime &&
      !latestAttendance?.regularCheckOutTime
    ) {
      // Ensure both dates exist before comparison
      const checkInTime = latestAttendance.regularCheckInTime;
      const shiftStart = new Date(latestAttendance.shiftStartTime);

      if (
        isAfter(checkInTime, addMinutes(shiftStart, LATE_CHECK_IN_THRESHOLD))
      ) {
        details.push('late-check-in');
      }
    } else {
      // Handle normal flow
      if (isCheckingIn) {
        if (isEarlyCheckIn) details.push('early-check-in');
        if (isLateCheckIn) details.push('late-check-in');
      } else {
        if (isLateCheckOut) details.push('late-check-out');
        if (isOvertime) details.push('overtime');
      }
    }

    if (isOvernightShift) details.push('overnight-shift');

    return details.length > 0 ? details.join('-') : 'on-time';
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
    // Convert attendances to AttendanceRecord
    const attendanceRecords = user.attendances.map((attendance) => ({
      ...attendance,
      overtimeEntries: [], // These will be empty since we don't have the data
      timeEntries: [], // These will be empty since we don't have the data
    }));

    const latestAttendance = attendanceRecords[0];
    const isOnLeave = await this.leaveService.checkUserOnLeave(
      user.employeeId,
      now,
    );
    if (isOnLeave) return;

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
      latestAttendance.regularCheckInTime &&
      !latestAttendance.regularCheckOutTime
    ) {
      const checkOutTime = approvedOvertime
        ? parseISO(approvedOvertime.endTime)
        : shiftEnd;
      if (isAfter(now, addMinutes(checkOutTime, 30))) {
        await this.sendMissingCheckOutNotification(user);
      }
    }
  }

  private getShiftTimes(shift: ShiftData, date: Date) {
    const shiftStart = this.parseShiftTime(shift.startTime, date);
    const shiftEnd = this.parseShiftTime(shift.endTime, date);
    return { shiftStart, shiftEnd };
  }

  // Helper method for finding approved half-day leave
  private findApprovedHalfDayLeave(
    leaveRequests: LeaveRequest[],
    now: Date,
  ): LeaveRequest | undefined {
    return leaveRequests.find(
      (leave) =>
        leave.status === 'approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(parseISO(leave.startDate.toString()), now),
    );
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
}

import {
  ApprovedOvertimeInfo,
  CurrentPeriod,
  EffectiveShift,
  NextPeriod,
  ShiftAdjustment,
  ShiftStatus,
  ShiftWindowResponse,
  ShiftData,
  ATTENDANCE_CONSTANTS,
  ShiftWindows,
  OvertimeContext,
  TransitionInfo,
  AttendanceRecord,
  HolidayInfo,
} from '@/types/attendance';
import {
  PrismaClient,
  Shift,
  ShiftAdjustmentRequest,
  Department,
  User,
  AttendanceState,
  PeriodType,
} from '@prisma/client';
import {
  endOfDay,
  startOfDay,
  addMinutes,
  isAfter,
  addDays,
  subDays,
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
  isSameDay,
} from 'date-fns';
import { formatDate, getCurrentTime } from '../../utils/dateUtils';
import { HolidayService } from '../HolidayService';
import { getCacheData, setCacheData } from '../../lib/serverCache';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { ShiftTimeUtils } from './utils';
import { AttendanceRecordService } from '../Attendance/AttendanceRecordService';

const prisma = new PrismaClient();

export class ShiftManagementService {
  private overtimeService: OvertimeServiceServer | null = null;

  constructor(
    private prisma: PrismaClient,
    private holidayService: HolidayService,
    private attendanceRecordService: AttendanceRecordService, // Changed from AttendanceStatusService
  ) {
    this.utils = ShiftTimeUtils;
  }

  readonly utils: typeof ShiftTimeUtils;

  setOvertimeService(overtimeService: OvertimeServiceServer) {
    this.overtimeService = overtimeService;
  }

  private departmentShiftMap: { [key: string]: string } = {
    ฝ่ายขนส่ง: 'SHIFT101',
    ฝ่ายปฏิบัติการ: 'SHIFT103',
    'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)': 'SHIFT104',
    'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)': 'SHIFT101',
    'ฝ่ายผลิต-คัดคุณภาพและบรรจุ': 'SHIFT103',
    'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง': 'SHIFT103',
    'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์': 'SHIFT102',
    ฝ่ายประกันคุณภาพ: 'SHIFT103',
    ฝ่ายคลังสินค้าและแพ็คกิ้ง: 'SHIFT103',
    ฝ่ายจัดส่งสินค้า: 'SHIFT103',
    ฝ่ายจัดซื้อและประสานงาน: 'SHIFT103',
    ฝ่ายบริหารงานขาย: 'SHIFT103',
    ฝ่ายบัญชีและการเงิน: 'SHIFT103',
    ฝ่ายทรัพยากรบุคคล: 'SHIFT103',
    ฝ่ายรักษาความสะอาด: 'SHIFT102',
    ฝ่ายรักษาความปลอดภัย: 'SHIFT102',
  };

  private async getHolidayInfoWithCache(
    date: Date,
  ): Promise<HolidayInfo | undefined> {
    const cacheKey = `holiday:${formatDate(date)}`;

    // Try to get from cache first
    const cached = await getCacheData(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        console.error('Holiday cache parse error:', err);
      }
    }

    // If not in cache, fetch from service
    const today = startOfDay(date);
    const holidays = await this.holidayService.getHolidays(today, today);
    const holiday = holidays.find((h) => isSameDay(h.date, today));

    if (holiday) {
      const holidayInfo = {
        localName: holiday.localName !== null ? holiday.localName : '',
        date: format(holiday.date, 'yyyy-MM-dd'),
      };

      // Cache for 24 hours since holidays don't change frequently
      await setCacheData(cacheKey, JSON.stringify(holidayInfo), 24 * 3600);
      return holidayInfo;
    }

    // Cache negative result for 1 hour to prevent frequent checks
    await setCacheData(cacheKey, 'null', 3600);
    return undefined;
  }

  // Core shift determination
  async getEffectiveShift(
    employeeId: string,
    date: Date,
  ): Promise<EffectiveShift | null> {
    const cacheKey = `shift:${employeeId}:${formatDate(date)}`;
    const cached = await getCacheData(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        console.error('Cache parse error:', err);
      }
    }

    // Rest of the method remains same
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      select: { shiftCode: true },
    });

    if (!user?.shiftCode) return null;

    const regularShift = await this.getShiftByCode(user.shiftCode);
    if (!regularShift) return null;

    // Get adjustment and build result
    const adjustment = await this.prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        status: 'approved',
      },
      include: { requestedShift: true },
    });

    const result: EffectiveShift = {
      current: {
        id: adjustment?.requestedShift.id || regularShift.id,
        name: adjustment?.requestedShift.name || regularShift.name,
        shiftCode:
          adjustment?.requestedShift.shiftCode || regularShift.shiftCode,
        startTime:
          adjustment?.requestedShift.startTime || regularShift.startTime,
        endTime: adjustment?.requestedShift.endTime || regularShift.endTime,
        workDays: adjustment?.requestedShift.workDays || regularShift.workDays,
      },
      regular: {
        id: regularShift.id,
        name: regularShift.name,
        shiftCode: regularShift.shiftCode,
        startTime: regularShift.startTime,
        endTime: regularShift.endTime,
        workDays: regularShift.workDays,
      },
      isAdjusted: !!adjustment,
      adjustment,
    };

    await setCacheData(cacheKey, JSON.stringify(result), 3600);
    return result;
  }

  calculateShiftWindows(shift: ShiftData, date: Date): ShiftWindows {
    const now = getCurrentTime();
    console.log('Shift window calculation:', {
      input: {
        shift,
        date,
        now,
      },
      parseResults: {
        startTime: this.utils.parseShiftTime(shift.startTime, date),
        endTime: this.utils.parseShiftTime(shift.endTime, date),
      },
    });

    // First convert to minutes for easier comparison
    const startMinutes = this.getMinutesSinceMidnight(shift.startTime);
    const endMinutes = this.getMinutesSinceMidnight(shift.endTime);

    let shiftStart = this.utils.parseShiftTime(shift.startTime, date);
    let shiftEnd = this.utils.parseShiftTime(shift.endTime, date);

    // Only handle overnight if end time is actually less than start time in minutes
    if (endMinutes < startMinutes) {
      if (now.getHours() < endMinutes / 60) {
        shiftStart = subDays(shiftStart, 1);
      } else {
        shiftEnd = addDays(shiftEnd, 1);
      }
    }

    return {
      start: shiftStart,
      end: shiftEnd,
      earlyWindow: subMinutes(
        shiftStart,
        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
      ),
      lateWindow: addMinutes(
        shiftStart,
        ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
      ),
      overtimeWindow: addMinutes(
        shiftEnd,
        ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
      ),
    };
  }

  private getMinutesSinceMidnight(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  async calculateShiftStatus(
    shift: ShiftData,
    windows: ShiftWindows,
    date: Date,
  ): Promise<ShiftStatus> {
    const now = getCurrentTime();
    const today = startOfDay(now);

    // Basic status checks
    const isOutsideShift = !isWithinInterval(now, {
      start: windows.earlyWindow,
      end: windows.overtimeWindow,
    });

    const isLate = isAfter(now, windows.lateWindow);
    const isDayOff = !shift.workDays.includes(date.getDay());

    // Use cached holiday check
    const holidayInfo = await this.getHolidayInfoWithCache(today);
    const isHoliday = !!holidayInfo;

    // Overtime check
    let isOvertime = false;
    if (this.overtimeService) {
      const overtimeRequest =
        await this.overtimeService.getCurrentApprovedOvertimeRequest(
          shift.id,
          date,
        );
      if (overtimeRequest) {
        const overtimeStart = parseISO(
          `${format(date, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
        );
        const overtimeEnd = parseISO(
          `${format(date, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
        );

        isOvertime = isWithinInterval(now, {
          start: overtimeStart,
          end: overtimeEnd,
        });
      }
    }

    return {
      isOutsideShift,
      isLate,
      isDayOff,
      isHoliday,
      isOvertime,
    };
  }

  // Main method that combines all pieces
  async getEffectiveShiftAndStatus(
    employeeId: string,
    date: Date = getCurrentTime(),
  ) {
    const effectiveShift = await this.getEffectiveShift(employeeId, date);
    if (!effectiveShift) return null;

    const windows = this.calculateShiftWindows(effectiveShift.current, date);
    const status = await this.calculateShiftStatus(
      effectiveShift.current,
      windows,
      date,
    );
    // Use cached holiday info
    const holidayInfo = status.isHoliday
      ? await this.getHolidayInfoWithCache(date)
      : undefined;

    return {
      regularShift: effectiveShift.regular,
      effectiveShift: effectiveShift.current,
      shiftstatus: status,
      windows,
      holidayInfo,
    };
  }

  async getShiftWindows(employeeId: string, date: Date): Promise<ShiftWindows> {
    const effectiveShift = await this.getEffectiveShift(employeeId, date);
    if (!effectiveShift) {
      throw new Error('No effective shift found');
    }

    return this.calculateShiftWindows(effectiveShift.current, date);
  }

  /** @deprecated Use getCurrentPeriodState instead */
  async getCurrentWindow(
    employeeId: string,
    date: Date,
  ): Promise<ShiftWindowResponse | null> {
    // Temporarily delegate to getCurrentPeriodState for backwards compatibility
    return this.getCurrentPeriodState(employeeId, date);
  }

  async getCurrentPeriodState(
    employeeId: string,
    date: Date,
  ): Promise<ShiftWindowResponse | null> {
    const now = getCurrentTime();
    const localNow = addMinutes(now, -now.getTimezoneOffset());
    const today = startOfDay(localNow);

    try {
      // Get shift data
      const shiftData = await this.getEffectiveShiftAndStatus(employeeId, date);
      if (!shiftData?.effectiveShift) return null;

      const { effectiveShift, shiftstatus, holidayInfo } = shiftData;
      const windows = this.calculateShiftWindows(effectiveShift, date);

      // Get overtime periods
      const overtimePeriods =
        await this.overtimeService?.getCurrentApprovedOvertimeRequest(
          employeeId,
          today,
        );

      const sortedOvertimes = overtimePeriods ? [overtimePeriods] : [];

      // Get attendance
      const attendance =
        await this.attendanceRecordService.getLatestAttendanceRecord(
          employeeId,
        );
      const attendanceState = this.determineAttendanceState(attendance);

      // Get current period type
      const currentPeriod = await this.determineCurrentPeriod(
        attendance,
        attendanceState,
        sortedOvertimes,
        windows,
        date,
      );

      // Calculate next period
      const nextPeriod = await this.calculateNextPeriod(
        currentPeriod,
        sortedOvertimes,
        effectiveShift,
        windows,
        localNow,
      );

      // Calculate transition if any
      const transition = this.calculateTransition(
        currentPeriod,
        nextPeriod,
        localNow,
      );

      return {
        current: {
          start:
            currentPeriod.type === PeriodType.REGULAR
              ? format(windows.start, "yyyy-MM-dd'T'HH:mm:ss.SSS")
              : currentPeriod.overtimeInfo
                ? format(
                    parseISO(
                      `${format(date, 'yyyy-MM-dd')}T${currentPeriod.overtimeInfo.startTime}`,
                    ),
                    "yyyy-MM-dd'T'HH:mm:ss.SSS",
                  )
                : format(windows.start, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
          end:
            currentPeriod.type === PeriodType.REGULAR
              ? format(windows.end, "yyyy-MM-dd'T'HH:mm:ss.SSS")
              : currentPeriod.overtimeInfo
                ? format(
                    parseISO(
                      `${format(date, 'yyyy-MM-dd')}T${currentPeriod.overtimeInfo.endTime}`,
                    ),
                    "yyyy-MM-dd'T'HH:mm:ss.SSS",
                  )
                : format(windows.end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        },
        type: currentPeriod.type,
        shift: this.mapShiftData(effectiveShift),
        isHoliday: shiftstatus.isHoliday,
        isDayOff: shiftstatus.isDayOff,
        isAdjusted: shiftData.regularShift.id !== effectiveShift.id,
        holidayInfo,
        overtimeInfo:
          currentPeriod.type === PeriodType.OVERTIME
            ? currentPeriod.overtimeInfo
            : undefined,
        nextPeriod,
        transition,
      };
    } catch (error) {
      console.error('Error in getCurrentPeriodState:', error);
      return null;
    }
  }

  private async determineCurrentPeriod(
    attendance: AttendanceRecord | null,
    attendanceState: AttendanceState,
    sortedOvertimes: ApprovedOvertimeInfo[],
    windows: ShiftWindows,
    date: Date,
  ): Promise<CurrentPeriod> {
    const now = getCurrentTime();

    // First check for active overtime periods
    for (const ot of sortedOvertimes) {
      const otStartTime = parseISO(
        `${format(date, 'yyyy-MM-dd')}T${ot.startTime}`,
      );

      // Check if we're approaching overtime
      const isApproachingOt = isWithinInterval(now, {
        start: subMinutes(otStartTime, 15),
        end: otStartTime,
      });

      if (isApproachingOt || this.isWithinOvertimePeriod(now, date, ot)) {
        return {
          type: PeriodType.OVERTIME,
          overtimeInfo: this.mapOvertimeInfo(ot),
          isComplete: isApproachingOt ? false : true,
        };
      }
    }

    // Handle incomplete overtime
    const incompleteOvertime =
      attendance?.CheckInTime &&
      !attendance?.CheckOutTime &&
      attendanceState === AttendanceState.INCOMPLETE;

    if (incompleteOvertime) {
      const matchingOt = this.findMatchingOvertime(
        sortedOvertimes,
        date,
        attendance,
      );
      if (matchingOt) {
        return {
          type: PeriodType.OVERTIME,
          overtimeInfo: this.mapOvertimeInfo(matchingOt),
          isComplete: true,
        };
      }
    }

    // Check active overtime periods
    for (const ot of sortedOvertimes) {
      if (this.isWithinOvertimePeriod(now, date, ot)) {
        // Don't switch to overtime if previous period incomplete
        if (
          attendanceState === AttendanceState.INCOMPLETE &&
          !attendance?.CheckOutTime
        ) {
          continue;
        }

        return {
          type: PeriodType.OVERTIME,
          overtimeInfo: this.mapOvertimeInfo(ot),
          isComplete: true,
        };
      }
    }

    // Default to regular period
    return {
      type: PeriodType.REGULAR,
      isComplete: Boolean(
        attendance?.CheckOutTime ||
          attendanceState !== AttendanceState.INCOMPLETE,
      ),
    };
  }

  private findMatchingOvertime(
    overtimes: ApprovedOvertimeInfo[],
    date: Date,
    attendance: AttendanceRecord | null,
  ): ApprovedOvertimeInfo | undefined {
    if (!attendance?.CheckInTime) return undefined;

    const checkInTime = new Date(attendance.CheckInTime).getTime();

    return overtimes.find((ot) => {
      const otStartTime = parseISO(
        `${format(date, 'yyyy-MM-dd')}T${ot.startTime}`,
      ).getTime();

      return otStartTime <= checkInTime;
    });
  }

  private calculateTransition(
    currentPeriod: CurrentPeriod,
    nextPeriod: NextPeriod | null,
    now: Date,
  ): TransitionInfo | undefined {
    if (!nextPeriod) {
      return undefined;
    }

    // Remove isComplete check for transitions
    const nextStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${nextPeriod.startTime}`,
    );

    // Check if approaching shift end with upcoming overtime
    const isApproachingShiftEnd = isWithinInterval(now, {
      start: subMinutes(nextStart, 15),
      end: nextStart,
    });

    if (isApproachingShiftEnd && nextPeriod.type === PeriodType.OVERTIME) {
      return {
        from: {
          type: currentPeriod.type,
          end: format(now, 'HH:mm'),
        },
        to: {
          type: nextPeriod.type,
          start: nextPeriod.startTime,
        },
        isInTransition: true,
      };
    }

    return undefined;
  }

  private async calculateNextPeriod(
    currentPeriod: CurrentPeriod,
    sortedOvertimes: ApprovedOvertimeInfo[],
    effectiveShift: ShiftData,
    windows: ShiftWindows,
    now: Date,
  ): Promise<NextPeriod | null> {
    if (currentPeriod.type === PeriodType.REGULAR) {
      const nextOt = sortedOvertimes.find(
        (ot) => parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.startTime}`) > now,
      );

      console.log('Next overtime:', nextOt);

      if (nextOt) {
        return {
          type: PeriodType.OVERTIME,
          startTime: nextOt.startTime,
          overtimeInfo: this.mapOvertimeInfo(nextOt),
        };
      }

      return {
        type: PeriodType.REGULAR,
        startTime: effectiveShift.startTime,
      };
    } else if (currentPeriod.type === PeriodType.OVERTIME) {
      if (now < windows.start) {
        return {
          type: PeriodType.REGULAR,
          startTime: effectiveShift.startTime,
        };
      }
    }

    return null;
  }

  private mapOvertimeInfo(ot: ApprovedOvertimeInfo): OvertimeContext {
    return {
      id: ot.id,
      startTime: ot.startTime,
      endTime: ot.endTime,
      durationMinutes: ot.durationMinutes,
      isInsideShiftHours: ot.isInsideShiftHours,
      isDayOffOvertime: ot.isDayOffOvertime,
      reason: ot.reason || '',
    };
  }

  private isWithinOvertimePeriod(
    now: Date,
    date: Date,
    overtime: ApprovedOvertimeInfo,
  ): boolean {
    const otStart = parseISO(
      `${format(date, 'yyyy-MM-dd')}T${overtime.startTime}`,
    );
    let otEnd = parseISO(`${format(date, 'yyyy-MM-dd')}T${overtime.endTime}`);

    // Handle overnight overtime
    if (overtime.endTime < overtime.startTime) {
      otEnd = addDays(otEnd, 1);
    }

    return isWithinInterval(now, { start: otStart, end: otEnd });
  }

  private determineAttendanceState(attendance: any): AttendanceState {
    if (!attendance) return AttendanceState.ABSENT;
    if (!attendance.CheckInTime) return AttendanceState.ABSENT;
    if (!attendance.CheckOutTime) return AttendanceState.INCOMPLETE;
    if (attendance.isOvertime) return AttendanceState.OVERTIME;
    return AttendanceState.PRESENT;
  }

  private mapShiftData(shift: any) {
    return {
      id: shift.id,
      shiftCode: shift.shiftCode,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays,
    };
  }

  public async getShiftByCode(shiftCode: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({
      where: { shiftCode },
    });
  }

  async getAllShifts(): Promise<Shift[]> {
    return this.prisma.shift.findMany();
  }

  async getUserShift(userId: string): Promise<Shift | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { shiftCode: true },
    });

    if (!user || !user.shiftCode) return null;

    return this.getShiftByCode(user.shiftCode);
  }

  async getShiftById(shiftId: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({ where: { id: shiftId } });
  }

  getDefaultShiftCodeForDepartment(departmentName: string): string {
    return this.departmentShiftMap[departmentName] || 'SHIFT103';
  }

  async getDepartmentByName(
    departmentName: string,
  ): Promise<Department | null> {
    return this.prisma.department.findUnique({
      where: { name: departmentName },
    });
  }

  async getShiftForDepartment(departmentName: string): Promise<Shift | null> {
    const shiftCode = this.getDefaultShiftCodeForDepartment(departmentName);
    return this.getShiftByCode(shiftCode);
  }

  async assignShiftToUser(userId: string, shiftCode: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { shiftCode: shiftCode },
    });
  }

  async getShiftAdjustmentForDate(
    userId: string,
    date: Date,
  ): Promise<ShiftAdjustment | null> {
    const adjustment = await this.prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId: userId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
      },
      include: { requestedShift: true },
    });

    if (!adjustment) return null;

    return {
      id: '', // Add the id property with an empty string value
      date: new Date(adjustment.date),
      employeeId: adjustment.employeeId,
      requestedShiftId: adjustment.requestedShiftId,
      requestedShift: adjustment.requestedShift,
      status: adjustment.status as 'pending' | 'approved' | 'rejected',
      reason: adjustment.reason,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    };
  }

  async requestShiftAdjustment(
    userId: string,
    date: Date,
    newShiftId: string,
  ): Promise<ShiftAdjustmentRequest> {
    return this.prisma.shiftAdjustmentRequest.create({
      data: {
        employeeId: userId,
        date: date,
        requestedShiftId: newShiftId,
        status: 'pending',
        reason: '', // Add the reason property with an empty string value
      },
    });
  }

  async getFutureShifts(
    employeeId: string,
    startDate: Date,
  ): Promise<Array<{ date: string; shift: Shift }>> {
    const futureShifts = await this.prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
        date: { gte: startDate },
        status: 'approved',
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return futureShifts.map((adjustment) => ({
      date: adjustment.date.toISOString(),
      shift: {
        id: adjustment.requestedShift.id,
        name: adjustment.requestedShift.name,
        startTime: adjustment.requestedShift.startTime,
        endTime: adjustment.requestedShift.endTime,
        workDays: adjustment.requestedShift.workDays,
        shiftCode: adjustment.requestedShift.shiftCode,
      },
    }));
  }

  async getAllDepartments(): Promise<Department[]> {
    return this.prisma.department.findMany();
  }

  async isOutsideShiftHours(
    employeeId: string,
    checkTime: Date,
  ): Promise<boolean> {
    const shiftData = await this.getEffectiveShiftAndStatus(
      employeeId,
      checkTime,
    );
    if (!shiftData?.effectiveShift) return true;

    return shiftData.shiftstatus.isOutsideShift;
  }

  async isWithinShiftWindow(
    employeeId: string,
    checkTime: Date,
    windowMinutes: number = ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD,
  ): Promise<boolean> {
    const shiftData = await this.getEffectiveShiftAndStatus(
      employeeId,
      checkTime,
    );
    if (!shiftData?.effectiveShift) return false;

    const shiftStart = this.utils.parseShiftTime(
      shiftData.effectiveShift.startTime,
      checkTime,
    );
    const windowEnd = addMinutes(shiftStart, windowMinutes);

    return isWithinInterval(checkTime, {
      start: shiftStart,
      end: windowEnd,
    });
  }

  // Add method to pre-cache holidays for a date range
  async preloadHolidayCache(startDate: Date, endDate: Date): Promise<void> {
    const holidays = await this.holidayService.getHolidays(startDate, endDate);

    await Promise.all(
      holidays.map(async (holiday) => {
        const cacheKey = `holiday:${formatDate(holiday.date)}`;
        const holidayInfo = {
          name: holiday.name,
          date: format(holiday.date, 'yyyy-MM-dd'),
        };
        await setCacheData(cacheKey, JSON.stringify(holidayInfo), 24 * 3600);
      }),
    );
  }

  // Optional: Add method to validate and refresh holiday cache
  async validateHolidayCache(date: Date): Promise<void> {
    const cacheKey = `holiday:${formatDate(date)}`;
    const cached = await getCacheData(cacheKey);

    if (!cached) {
      await this.getHolidayInfoWithCache(date);
    }
  }
}

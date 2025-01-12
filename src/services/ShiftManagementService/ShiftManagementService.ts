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
  VALIDATION_THRESHOLDS,
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

interface OvertimeTimeInfo {
  startTime: string;
  endTime: string;
}

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

      // Get ALL overtimes for the day and sort them
      const overtimes = await this.overtimeService?.getDetailedOvertimesInRange(
        employeeId,
        startOfDay(date),
        endOfDay(date),
      );

      // Log all retrieved overtimes
      console.log('Retrieved overtimes:', {
        count: overtimes?.length,
        overtimes: overtimes?.map((ot) => ({
          startTime: ot.startTime,
          endTime: ot.endTime,
          isOvernight: ot.endTime < ot.startTime,
        })),
      });

      // Sort and get relevant overtime
      const relevantOvertime = this.findRelevantOvertime(overtimes || [], now);

      console.log(
        'Selected overtime:',
        relevantOvertime
          ? {
              startTime: relevantOvertime.startTime,
              endTime: relevantOvertime.endTime,
              isOvernight:
                relevantOvertime.endTime < relevantOvertime.startTime,
              isBeforeShift:
                relevantOvertime.startTime < effectiveShift.startTime,
            }
          : 'No relevant overtime',
      );

      // Get attendance
      const attendance =
        await this.attendanceRecordService.getLatestAttendanceRecord(
          employeeId,
        );
      const attendanceState = this.determineAttendanceState(attendance);

      // Get current period
      const currentPeriod = await this.determineCurrentPeriod(
        attendance,
        attendanceState,
        relevantOvertime,
        windows,
        date,
      );

      // Calculate next period
      const nextPeriod = await this.calculateNextPeriod(
        currentPeriod,
        relevantOvertime,
        effectiveShift,
        windows,
        localNow,
      );

      // Calculate transition
      const transition = this.calculateTransition(
        currentPeriod,
        nextPeriod,
        localNow,
      );

      return {
        current: this.calculateCurrentWindow(currentPeriod, windows, date),
        type: currentPeriod.type,
        shift: this.mapShiftData(effectiveShift),
        isHoliday: shiftstatus.isHoliday,
        isDayOff: shiftstatus.isDayOff,
        isAdjusted: shiftData.regularShift.id !== effectiveShift.id,
        holidayInfo,
        overtimeInfo: relevantOvertime
          ? this.mapOvertimeInfo(relevantOvertime)
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
    currentOvertime: ApprovedOvertimeInfo | null,
    windows: ShiftWindows,
    date: Date,
  ): Promise<CurrentPeriod> {
    const now = getCurrentTime();

    console.log('Determining current period:', {
      currentTime: format(now, 'HH:mm:ss'),
      attendance: attendance
        ? {
            type: attendance.type,
            isActive: Boolean(
              attendance.CheckInTime && !attendance.CheckOutTime,
            ),
          }
        : null,
      overtime: currentOvertime
        ? {
            startTime: currentOvertime.startTime,
            endTime: currentOvertime.endTime,
            isBeforeShift:
              parseISO(
                `${format(date, 'yyyy-MM-dd')}T${currentOvertime.startTime}`,
              ) < windows.start,
          }
        : null,
      windows: {
        regular: {
          start: format(windows.start, 'HH:mm:ss'),
          end: format(windows.end, 'HH:mm:ss'),
        },
        early: format(windows.earlyWindow, 'HH:mm:ss'),
      },
    });

    // Handle active attendance first
    if (attendance?.CheckInTime && !attendance?.CheckOutTime) {
      if (attendance.type === PeriodType.OVERTIME) {
        const overtimes =
          (await this.overtimeService?.getDetailedOvertimesInRange(
            attendance.employeeId,
            startOfDay(date),
            endOfDay(date),
          )) || [];

        const matchingOt = this.findMatchingOvertime(
          overtimes,
          date,
          attendance,
        );

        return {
          type: PeriodType.OVERTIME,
          overtimeInfo: matchingOt
            ? this.mapOvertimeInfo(matchingOt)
            : undefined,
          isComplete: false,
        };
      }

      return {
        type: PeriodType.REGULAR,
        isComplete: false,
      };
    }

    // Early overtime checks
    if (currentOvertime) {
      const otStart = parseISO(
        `${format(date, 'yyyy-MM-dd')}T${currentOvertime.startTime}`,
      );
      const otEarlyWindow = subMinutes(
        otStart,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      );
      const isBeforeShift = otStart < windows.start;

      console.log('Overtime period analysis:', {
        currentTime: format(now, 'HH:mm:ss'),
        overtime: {
          start: format(otStart, 'HH:mm:ss'),
          earlyWindow: format(otEarlyWindow, 'HH:mm:ss'),
          isBeforeShift,
        },
      });

      // If it's early overtime period
      if (isBeforeShift) {
        // Check if we're in early window
        if (now >= otEarlyWindow) {
          return {
            type: PeriodType.OVERTIME,
            overtimeInfo: this.mapOvertimeInfo(currentOvertime),
            isComplete: false,
          };
        }

        // If we're before early window of early overtime
        if (now < otEarlyWindow) {
          return {
            type: PeriodType.OVERTIME,
            overtimeInfo: this.mapOvertimeInfo(currentOvertime),
            isComplete: false,
          };
        }
      }
    }

    // Only check regular shift if there's no early overtime or we're past it
    const isWithinRegularPeriod = isWithinInterval(now, {
      start: windows.earlyWindow,
      end: windows.overtimeWindow,
    });

    if (isWithinRegularPeriod) {
      return {
        type: PeriodType.REGULAR,
        isComplete: Boolean(
          attendance?.CheckOutTime ||
            attendanceState !== AttendanceState.INCOMPLETE,
        ),
      };
    }

    // Default - if there's upcoming overtime, show that
    if (currentOvertime) {
      return {
        type: PeriodType.OVERTIME,
        overtimeInfo: this.mapOvertimeInfo(currentOvertime),
        isComplete: false,
      };
    }

    // Finally default to regular
    return {
      type: PeriodType.REGULAR,
      isComplete: Boolean(
        attendance?.CheckOutTime ||
          attendanceState !== AttendanceState.INCOMPLETE,
      ),
    };
  }

  private findRelevantOvertime(
    overtimes: ApprovedOvertimeInfo[],
    now: Date,
  ): ApprovedOvertimeInfo | null {
    const sortedOvertimes = [...overtimes].sort((a, b) => {
      const aStart = this.getMinutesSinceMidnight(a.startTime);
      const bStart = this.getMinutesSinceMidnight(b.startTime);
      return aStart - bStart;
    });

    // First, check for active overtime
    const activeOvertime = sortedOvertimes.find((ot) => {
      const start = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.startTime}`);
      let end = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.endTime}`);

      // Handle overnight overtime
      if (ot.endTime < ot.startTime) {
        end = addDays(end, 1);
      }

      const earlyWindow = subMinutes(
        start,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      );
      return now >= earlyWindow && now <= end;
    });

    if (activeOvertime) {
      console.log('Found active overtime:', {
        startTime: activeOvertime.startTime,
        endTime: activeOvertime.endTime,
        isOvernight: activeOvertime.endTime < activeOvertime.startTime,
      });
      return activeOvertime;
    }

    // Then look for next upcoming overtime
    const upcomingOvertime = sortedOvertimes.find((ot) => {
      const start = parseISO(`${format(now, 'yyyy-MM-dd')}T${ot.startTime}`);
      const earlyWindow = subMinutes(
        start,
        VALIDATION_THRESHOLDS.EARLY_CHECKIN,
      );
      return now < start;
    });

    if (upcomingOvertime) {
      console.log('Found upcoming overtime:', {
        startTime: upcomingOvertime.startTime,
        endTime: upcomingOvertime.endTime,
        isOvernight: upcomingOvertime.endTime < upcomingOvertime.startTime,
      });
    }

    return upcomingOvertime || null;
  }

  private calculateCurrentWindow(
    currentPeriod: CurrentPeriod,
    windows: ShiftWindows,
    date: Date,
  ): { start: string; end: string } {
    if (
      currentPeriod.type === PeriodType.OVERTIME &&
      currentPeriod.overtimeInfo
    ) {
      const start = parseISO(
        `${format(date, 'yyyy-MM-dd')}T${currentPeriod.overtimeInfo.startTime}`,
      );
      let end = parseISO(
        `${format(date, 'yyyy-MM-dd')}T${currentPeriod.overtimeInfo.endTime}`,
      );

      // Handle overnight overtime
      if (
        currentPeriod.overtimeInfo.endTime <
        currentPeriod.overtimeInfo.startTime
      ) {
        end = addDays(end, 1);
      }

      return {
        start: format(start, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
        end: format(end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      };
    }

    return {
      start: format(windows.start, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
      end: format(windows.end, "yyyy-MM-dd'T'HH:mm:ss.SSS"),
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

  private isWithinOvertimePeriod(
    now: Date,
    date: Date,
    overtime: ApprovedOvertimeInfo,
    includeEarlyWindow: boolean = true,
  ): boolean {
    const otStart = parseISO(
      `${format(date, 'yyyy-MM-dd')}T${overtime.startTime}`,
    );
    let otEnd = parseISO(`${format(date, 'yyyy-MM-dd')}T${overtime.endTime}`);

    // Handle overnight overtime
    if (overtime.endTime < overtime.startTime) {
      otEnd = addDays(otEnd, 1);
    }

    // Include early check-in window if specified
    const periodStart = includeEarlyWindow
      ? subMinutes(otStart, ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD)
      : otStart;

    const isWithin = isWithinInterval(now, {
      start: periodStart,
      end: otEnd,
    });

    console.log('Overtime period check:', {
      currentTime: format(now, 'HH:mm:ss'),
      overtime: {
        startTime: overtime.startTime,
        endTime: overtime.endTime,
        isOvernight: overtime.endTime < overtime.startTime,
      },
      periodWindow: {
        start: format(periodStart, 'HH:mm:ss'),
        end: format(otEnd, 'HH:mm:ss'),
      },
      includeEarlyWindow,
      isWithinPeriod: isWithin,
    });

    return isWithin;
  }

  private async calculateNextPeriod(
    currentPeriod: CurrentPeriod,
    currentOvertime: ApprovedOvertimeInfo | null,
    shift: ShiftData,
    windows: ShiftWindows,
    now: Date,
  ): Promise<NextPeriod | null> {
    console.log('Calculating next period:', {
      currentTime: format(now, 'HH:mm:ss'),
      currentPeriod: {
        type: currentPeriod.type,
        hasOvertimeInfo: Boolean(currentPeriod.overtimeInfo),
      },
      currentOvertime: currentOvertime
        ? {
            startTime: currentOvertime.startTime,
            endTime: currentOvertime.endTime,
          }
        : null,
    });

    // If in regular period and overtime is next
    if (currentPeriod.type === PeriodType.REGULAR && currentOvertime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${currentOvertime.startTime}`,
      );
      if (now < overtimeStart) {
        return {
          type: PeriodType.OVERTIME,
          startTime: currentOvertime.startTime,
          overtimeInfo: this.mapOvertimeInfo(currentOvertime),
        };
      }
    }

    // If in early overtime period, next is regular shift
    if (currentPeriod.type === PeriodType.OVERTIME && currentOvertime) {
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${currentOvertime.startTime}`,
      );
      if (overtimeStart < windows.start) {
        return {
          type: PeriodType.REGULAR,
          startTime: shift.startTime,
        };
      }
    }

    return null;
  }

  private isEarlyMorningOvertime(
    overtime: OvertimeTimeInfo,
    shift: ShiftData,
  ): boolean {
    const otStart = this.getMinutesSinceMidnight(overtime.startTime);
    const shiftStart = this.getMinutesSinceMidnight(shift.startTime);
    return otStart < shiftStart;
  }

  private logAvailablePeriods(
    overtimes: ApprovedOvertimeInfo[],
    shift: ShiftData,
    now: Date,
  ): void {
    console.log('Available periods for:', format(now, 'yyyy-MM-dd'), {
      regularShift: {
        start: shift.startTime,
        end: shift.endTime,
      },
      overtimes: overtimes.map((ot) => ({
        startTime: ot.startTime,
        endTime: ot.endTime,
        isEarlyMorning: this.isEarlyMorningOvertime(ot, shift),
        durationMinutes: ot.durationMinutes,
        reason: ot.reason || undefined,
      })),
    });
  }

  // Update transition calculation with better logging
  private calculateTransition(
    currentPeriod: CurrentPeriod,
    nextPeriod: NextPeriod | null,
    now: Date,
  ): TransitionInfo | undefined {
    if (!nextPeriod) {
      console.log('No next period available for transition');
      return undefined;
    }

    const nextStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${nextPeriod.startTime}`,
    );
    const transitionWindow = {
      start: subMinutes(nextStart, 15),
      end: nextStart,
    };

    const isInTransition = isWithinInterval(now, transitionWindow);

    console.log('Transition check:', {
      currentTime: format(now, 'HH:mm:ss'),
      nextPeriodStart: nextPeriod.startTime,
      transitionWindow: {
        start: format(transitionWindow.start, 'HH:mm:ss'),
        end: format(transitionWindow.end, 'HH:mm:ss'),
      },
      isInTransition,
    });

    if (isInTransition) {
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

  async getNextDayPeriodState(
    employeeId: string,
    now: Date,
  ): Promise<ShiftWindowResponse> {
    const nextDay = addDays(now, 1);
    const baseWindow = await this.getCurrentWindow(employeeId, nextDay);
    if (!baseWindow) {
      return {
        type: PeriodType.OVERTIME,
        current: {
          start: format(startOfDay(nextDay), "yyyy-MM-dd'T'HH:mm:ss"),
          end: format(endOfDay(nextDay), "yyyy-MM-dd'T'HH:mm:ss"),
        },
        shift: {
          id: '',
          shiftCode: '',
          name: '',
          startTime: '',
          endTime: '',
          workDays: [],
        },
        isHoliday: false,
        isDayOff: false,
        isAdjusted: false,
      };
    }

    try {
      const overtimes =
        (await this.overtimeService?.getDetailedOvertimesInRange(
          employeeId,
          startOfDay(nextDay),
          endOfDay(nextDay),
        )) || [];

      console.log('Debug overtimes:', {
        hasOvertimes: Boolean(overtimes?.length),
        overtimes,
        baseWindow,
      });

      if (overtimes && overtimes.length > 0) {
        // Log the transformed data
        const transformedResponse = {
          ...baseWindow,
          overtimeInfo: {
            id: overtimes[0].id,
            startTime: overtimes[0].startTime,
            endTime: overtimes[0].endTime,
            durationMinutes: overtimes[0].durationMinutes,
            isInsideShiftHours: overtimes[0].isInsideShiftHours,
            isDayOffOvertime: overtimes[0].isDayOffOvertime,
            reason: overtimes[0].reason || undefined,
          },
        };
        console.log('Transformed response:', transformedResponse);
        return transformedResponse;
      }

      return baseWindow;
    } catch (error) {
      console.error('Error getting next day overtimes:', error);
      return baseWindow;
    }
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

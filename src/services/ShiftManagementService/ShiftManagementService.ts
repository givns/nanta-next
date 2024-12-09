import {
  EffectiveShift,
  PeriodType,
  ShiftAdjustment,
  ShiftStatus,
  ShiftWindowResponse,
} from '@/types/attendance';
import {
  PrismaClient,
  Shift,
  ShiftAdjustmentRequest,
  Department,
  User,
} from '@prisma/client';
import axios from 'axios';
import {
  ShiftData,
  ATTENDANCE_CONSTANTS,
  EffectiveShiftResult,
  ShiftWindows,
} from '../../types/attendance';
import {
  endOfDay,
  startOfDay,
  addMinutes,
  isBefore,
  isAfter,
  addDays,
  subDays,
  parseISO,
  format,
  isWithinInterval,
  subMinutes,
} from 'date-fns';
import {
  formatDate,
  formatDateTime,
  getCurrentTime,
  toBangkokTime,
} from '../../utils/dateUtils';
import { HolidayService } from '../HolidayService';
import {
  getCacheData,
  setCacheData,
  invalidateCachePattern,
} from '../../lib/serverCache';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { ShiftTimeUtils } from './utils';
import { duration } from 'moment-timezone';
import { over } from 'lodash';

export class ShiftManagementService {
  private overtimeService: OvertimeServiceServer | null = null;

  constructor(
    private prisma: PrismaClient,
    private holidayService: HolidayService,
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

  // Core shift determination
  async getEffectiveShift(
    employeeId: string,
    date: Date,
  ): Promise<EffectiveShift | null> {
    const cacheKey = `shift:${employeeId}:${formatDate(date)}`;
    const cached = await getCacheData(cacheKey);
    if (cached) return JSON.parse(cached);

    // Get user's default shift
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      select: { shiftCode: true },
    });

    if (!user?.shiftCode) return null;

    const regularShift = await this.getShiftByCode(user.shiftCode);
    if (!regularShift) return null;

    // Check for adjustment
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
      current: adjustment
        ? this.convertToShiftData(adjustment.requestedShift)
        : this.convertToShiftData(regularShift),
      regular: this.convertToShiftData(regularShift),
      isAdjusted: !!adjustment,
      adjustment,
    };

    await setCacheData(cacheKey, JSON.stringify(result), 3600); // Cache for 1 hour
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

    // Holiday check
    const isHoliday = await this.holidayService.isHoliday(
      today,
      await this.holidayService.getHolidays(today, today),
      shift.shiftCode === 'SHIFT104',
    );

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

    return {
      regularShift: effectiveShift.regular,
      effectiveShift: effectiveShift.current,
      shiftstatus: status,
      windows,
    };
  }

  async getShiftWindows(employeeId: string, date: Date): Promise<ShiftWindows> {
    const effectiveShift = await this.getEffectiveShift(employeeId, date);
    if (!effectiveShift) {
      throw new Error('No effective shift found');
    }

    return this.calculateShiftWindows(effectiveShift.current, date);
  }

  async getCurrentWindow(
    employeeId: string,
    date: Date,
  ): Promise<ShiftWindowResponse | null> {
    // Get effective shift data
    const shiftData = await this.getEffectiveShiftAndStatus(employeeId, date);
    if (!shiftData) return null;

    const { effectiveShift, shiftstatus, windows } = shiftData;

    // Get holiday info if it's a holiday
    let holidayInfo;
    if (shiftstatus.isHoliday) {
      const holidays = await this.holidayService.getHolidays(
        startOfDay(date),
        startOfDay(date),
      );
      if (holidays.length > 0) {
        holidayInfo = {
          name: holidays[0].name,
          date: format(holidays[0].date, 'yyyy-MM-dd'),
        };
      }
    }

    // Get overtime info if exists
    let overtimeInfo;
    if (this.overtimeService) {
      const overtimeRequest =
        await this.overtimeService.getCurrentApprovedOvertimeRequest(
          employeeId,
          date,
        );
      if (overtimeRequest) {
        overtimeInfo = {
          id: overtimeRequest.id,
          startTime: overtimeRequest.startTime,
          endTime: overtimeRequest.endTime,
          durationMinutes: overtimeRequest.durationMinutes,
          isInsideShiftHours: overtimeRequest.isInsideShiftHours,
          isDayOffOvertime: overtimeRequest.isDayOffOvertime,
          reason: overtimeRequest.reason ?? '', // Provide default empty string value
        };
      }
    }

    // Get future shifts if any
    const futureShifts = await this.getFutureShifts(employeeId, date);

    return {
      current: {
        start: windows.start,
        end: windows.end,
      },
      type: overtimeInfo ? PeriodType.OVERTIME : PeriodType.REGULAR,
      shift: {
        id: effectiveShift.id,
        shiftCode: effectiveShift.shiftCode,
        name: effectiveShift.name,
        startTime: effectiveShift.startTime,
        endTime: effectiveShift.endTime,
        workDays: effectiveShift.workDays,
      },
      isHoliday: shiftstatus.isHoliday,
      isDayOff: shiftstatus.isDayOff,
      isAdjusted: shiftData.regularShift.id !== effectiveShift.id,
      holidayInfo,
      overtimeInfo,
      futureShifts,
    };
  }

  async invalidateShiftCache(employeeId: string): Promise<void> {
    await invalidateCachePattern(`shift:${employeeId}*`);
  }

  public async getShiftByCode(shiftCode: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({
      where: { shiftCode },
    });
  }

  private convertToShiftData(shift: Shift): ShiftData {
    return {
      id: shift.id,
      name: shift.name,
      shiftCode: shift.shiftCode,
      startTime: `${format(parseISO(`${format(new Date(), 'yyyy-MM-dd')}T${shift.startTime}`), 'HH:mm')}`,
      endTime: `${format(parseISO(`${format(new Date(), 'yyyy-MM-dd')}T${shift.endTime}`), 'HH:mm')}`,
      workDays: shift.workDays,
    };
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
}

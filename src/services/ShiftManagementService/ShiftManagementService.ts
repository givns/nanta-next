import {
  ApprovedOvertimeInfo,
  EffectiveShift,
  OvertimeContext,
  HolidayInfo,
  ShiftAdjustment,
} from '@/types/attendance';
import { PrismaClient, Shift, ShiftAdjustmentRequest } from '@prisma/client';
import { endOfDay, startOfDay, format, subDays } from 'date-fns';
import { formatDate, getCurrentTime } from '../../utils/dateUtils';
import { HolidayService } from '../HolidayService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { getCacheData, setCacheData } from '../../lib/serverCache';

export class ShiftManagementService {
  private overtimeService: OvertimeServiceServer | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly holidayService: HolidayService,
  ) {}

  setOvertimeService(overtimeService: OvertimeServiceServer) {
    this.overtimeService = overtimeService;
  }
  private shiftCache = new Map<string, { data: any; timestamp: number }>();
  private userShiftCache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_TTL = 3600000; // 1 hour in milliseconds

  async getUserShift(userId: string): Promise<Shift | null> {
    try {
      // Check memory cache first
      const cacheKey = `userShift:${userId}`;
      const cached = this.userShiftCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        console.log(`Using cached shift data for user ${userId}`);
        return cached.data;
      }

      // Direct, efficient query
      const user = await this.prisma.user.findUnique({
        where: { employeeId: userId },
        select: {
          shiftCode: true,
          shiftId: true,
        },
      });

      if (!user || !user.shiftCode) {
        return null;
      }

      // Check shift cache
      const shiftCacheKey = `shift:${user.shiftCode}`;
      const cachedShift = this.shiftCache.get(shiftCacheKey);
      if (cachedShift && Date.now() - cachedShift.timestamp < this.CACHE_TTL) {
        console.log(`Using cached shift data for code ${user.shiftCode}`);
        const shift = cachedShift.data;

        // Update user shift cache
        this.userShiftCache.set(cacheKey, {
          data: shift,
          timestamp: Date.now(),
        });
        return shift;
      }

      // Prefer direct shift retrieval if possible
      const shift = await this.getShiftByCode(user.shiftCode);

      // Cache the shift data
      if (shift) {
        this.shiftCache.set(shiftCacheKey, {
          data: shift,
          timestamp: Date.now(),
        });
        this.userShiftCache.set(cacheKey, {
          data: shift,
          timestamp: Date.now(),
        });
      }

      return shift;
    } catch (error) {
      console.error('Error retrieving user shift:', error);

      // Fallback with more robust error handling
      const defaultShift = {
        id: 'default',
        name: 'Default Shift',
        shiftCode: 'DEFAULT',
        startTime: '09:00',
        endTime: '18:00',
        workDays: [1, 2, 3, 4, 5],
      } as Shift;

      return defaultShift;
    }
  }

  /**
   * Core shift determination
   */
  async getEffectiveShift(
    employeeId: string,
    date: Date,
  ): Promise<EffectiveShift | null> {
    console.log('Getting effective shift:', employeeId, date);

    // Check memory cache first
    const memoryCacheKey = `effectiveShift:${employeeId}:${formatDate(date)}`;
    const memoryCached = this.shiftCache.get(memoryCacheKey);
    if (memoryCached && Date.now() - memoryCached.timestamp < this.CACHE_TTL) {
      console.log(`Using memory cached effective shift for ${employeeId}`);
      return memoryCached.data;
    }

    const cacheKey = `shift:${employeeId}:${formatDate(date)}`;
    const cached = await getCacheData(cacheKey);

    if (cached) {
      try {
        const parsedData = JSON.parse(cached);
        // Also update memory cache
        this.shiftCache.set(memoryCacheKey, {
          data: parsedData,
          timestamp: Date.now(),
        });
        return parsedData;
      } catch (err) {
        console.error('Cache parse error:', err);
      }
    }

    // FIX: Use findFirst with equals condition instead of findUnique
    const user = await this.prisma.user.findFirst({
      where: {
        employeeId: {
          equals: employeeId,
        },
      },
      select: { shiftCode: true },
    });

    if (!user?.shiftCode) return null;

    const regularShift = await this.getShiftByCode(user.shiftCode);
    if (!regularShift) return null;

    // Get shift adjustment with requested shift included
    const adjustment = await this.prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId: {
          equals: employeeId, // FIX: Use equals condition
        },
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        status: 'approved',
      },
      include: {
        requestedShift: true, // Include the relationship
      },
    });

    console.log('Shift adjustment:', adjustment?.requestedShift);

    const adjustedShift = adjustment?.requestedShift ?? null;

    const result: EffectiveShift = {
      current: {
        id: adjustedShift?.id || regularShift.id,
        name: adjustedShift?.name || regularShift.name,
        shiftCode: adjustedShift?.shiftCode || regularShift.shiftCode,
        startTime: adjustedShift?.startTime || regularShift.startTime,
        endTime: adjustedShift?.endTime || regularShift.endTime,
        workDays: adjustedShift?.workDays || regularShift.workDays,
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
      adjustment: adjustment as ShiftAdjustment | null, // Include if exists with proper type
    };

    console.log('Effective shift:', result);

    this.shiftCache.set(memoryCacheKey, {
      data: result,
      timestamp: Date.now(),
    });
    return result;
  }

  /**
   * Get overtime information for a date
   */
  async getOvertimeInfo(
    employeeId: string,
    date: Date,
  ): Promise<OvertimeContext | undefined> {
    if (!this.overtimeService) return undefined;

    // Expand date range to include potential overnight overtime
    const checkRange = {
      start: startOfDay(subDays(date, 1)), // Include previous day
      end: endOfDay(date), // Include current day's end
    };

    const overtimes = await this.overtimeService.getDetailedOvertimesInRange(
      employeeId,
      checkRange.start,
      checkRange.end,
    );

    if (!overtimes?.length) return undefined;

    // Convert to OvertimeContext
    return {
      id: overtimes[0].id,
      startTime: overtimes[0].startTime,
      endTime: overtimes[0].endTime,
      durationMinutes: overtimes[0].durationMinutes,
      isInsideShiftHours: overtimes[0].isInsideShiftHours,
      isDayOffOvertime: overtimes[0].isDayOffOvertime,
      reason: overtimes[0].reason || '',
    };
  }

  /**
   * Get current approved overtime request
   */
  async getCurrentApprovedOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertimeInfo | null> {
    if (!this.overtimeService) return null;

    const overtimes = await this.overtimeService.getDetailedOvertimesInRange(
      employeeId,
      startOfDay(date),
      endOfDay(date),
    );

    return overtimes?.[0] || null;
  }

  /**
   * Core shift queries
   */
  async getShiftByCode(shiftCode: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({
      where: { shiftCode },
    });
  }

  async getShiftById(shiftId: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({
      where: { id: shiftId },
    });
  }

  /**
   * Holiday/Schedule Related
   */
  private async getHolidayInfoWithCache(
    date: Date,
  ): Promise<HolidayInfo | undefined> {
    const cacheKey = `holiday:${formatDate(date)}`;
    const cached = await getCacheData(cacheKey);

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (err) {
        console.error('Holiday cache parse error:', err);
      }
    }

    const today = startOfDay(date);
    const holidays = await this.holidayService.getHolidays(today, today);
    const holiday = holidays.find(
      (h) => h.date.toDateString() === today.toDateString(),
    );

    if (holiday) {
      const holidayInfo = {
        localName: holiday.localName || '',
        date: format(holiday.date, 'yyyy-MM-dd'),
      };

      await setCacheData(cacheKey, JSON.stringify(holidayInfo), 24 * 3600);
      return holidayInfo;
    }

    await setCacheData(cacheKey, 'null', 3600);
    return undefined;
  }

  /**
   * Shift adjustment handling
   */
  private async getShiftAdjustment(
    userId: string,
    date: Date,
  ): Promise<ShiftAdjustmentRequest | null> {
    return this.prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId: {
          equals: userId, // FIX: Use equals condition
        },
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        status: 'approved',
      },
      include: { requestedShift: true },
    });
  }

  /** @deprecated Use PeriodManagementService.getCurrentPeriodState instead */
  async getCurrentPeriodState(): Promise<any> {
    throw new Error(
      'Deprecated: Use PeriodManagementService.getCurrentPeriodState',
    );
  }

  /** @deprecated Use PeriodManagementService.calculateWindows instead */
  calculateShiftWindows(): any {
    throw new Error('Deprecated: Use PeriodManagementService.calculateWindows');
  }

  /** @deprecated Use PeriodManagementService.isOutsideShiftHours instead */
  async isOutsideShiftHours(): Promise<boolean> {
    throw new Error(
      'Deprecated: Use PeriodManagementService.isOutsideShiftHours',
    );
  }

  /** @deprecated Use PeriodManagementService.isWithinShiftWindow instead */
  async isWithinShiftWindow(): Promise<boolean> {
    throw new Error('Deprecated: Use timeWindowManager.isWithinShiftWindow');
  }

  /** @deprecated Use PeriodManagementService.getNextDayPeriodState instead */
  async getNextDayPeriodState(): Promise<any> {
    throw new Error(
      'Deprecated: Use PeriodManagementService.getNextDayPeriodState',
    );
  }
}

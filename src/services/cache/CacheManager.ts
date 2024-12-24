// services/cache/CacheManager.ts

import { endOfDay, format, startOfDay } from 'date-fns';
import { cacheService } from './CacheService';
import { PrismaClient } from '@prisma/client';

import {
  AttendanceRecord,
  CACHE_CONSTANTS,
  AttendanceStatusResponse,
} from '../../types/attendance';
import { getCurrentTime } from '../../utils/dateUtils';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { AttendanceEnhancementService } from '../Attendance/AttendanceEnhancementService';
import { AttendanceMappers } from '../Attendance/utils/AttendanceMappers';

// Cache key generation
const generateCacheKey = {
  user: (id: string) => `user:${id}`,
  attendance: (id: string, date: string) => `attendance:${id}:${date}`,
  shift: (id: string) => `shift:${id}`,
  all: (employeeId: string) => ({
    user: generateCacheKey.user(employeeId),
    attendance: generateCacheKey.attendance(
      employeeId,
      format(new Date(), 'yyyy-MM-dd'),
    ),
    shift: generateCacheKey.shift(employeeId),
  }),
};

export class CacheManager {
  static getStatus(employeeId: any): any {
    throw new Error('Method not implemented.');
  }
  static fetchData(
    employeeId: any,
  ):
    | [any, any, any, any, any, any, any, any, any]
    | PromiseLike<[any, any, any, any, any, any, any, any, any]> {
    throw new Error('Method not implemented.');
  }
  static cacheAttendanceStatus(employeeId: any, status: string) {
    throw new Error('Method not implemented.');
  }
  private static instance: CacheManager | null = null;
  private constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly enhancementService: AttendanceEnhancementService,
  ) {}

  // Core caching methods
  public async cacheAttendanceState(
    employeeId: string,
    state: AttendanceStatusResponse,
    ttl = CACHE_CONSTANTS.ATTENDANCE_CACHE_TTL,
  ): Promise<void> {
    if (!cacheService || process.env.NODE_ENV === 'test') return;

    const cacheKey = this.generateCacheKey(employeeId, 'attendance');
    await cacheService.set(cacheKey, JSON.stringify(state), ttl);
  }

  // State fetching with caching
  async getAttendanceState(
    employeeId: string,
  ): Promise<AttendanceStatusResponse | null> {
    const cacheKey = this.generateCacheKey(employeeId, 'attendance');
    const cached = await cacheService?.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch fresh data
    const [record, window] = await Promise.all([
      this.fetchAttendanceRecord(employeeId),
      this.shiftService.getCurrentWindow(employeeId, getCurrentTime()),
    ]);

    if (!window) return null;

    // Generate fresh state
    const state = await this.enhancementService.enhanceAttendanceStatus(
      record,
      window,
      getCurrentTime(),
    );

    // Cache the result
    await this.cacheAttendanceState(employeeId, state);

    return state;
  }

  // Record fetching with mapping
  private async fetchAttendanceRecord(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    const today = startOfDay(getCurrentTime());

    const record = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: today,
          lt: endOfDay(today),
        },
      },
      include: {
        timeEntries: true,
        overtimeEntries: true,
      },
    });

    return record ? AttendanceMappers.toAttendanceRecord(record) : null;
  }

  // Cache key management
  private generateCacheKey(
    employeeId: string,
    type: 'attendance' | 'window' | 'validation',
  ): string {
    const date = format(getCurrentTime(), 'yyyy-MM-dd');
    return `${type}:${employeeId}:${date}`;
  }

  // Cache invalidation
  async invalidateCache(employeeId: string): Promise<void> {
    if (!cacheService) return;

    const patterns = [
      this.generateCacheKey(employeeId, 'attendance'),
      this.generateCacheKey(employeeId, 'window'),
      this.generateCacheKey(employeeId, 'validation'),
    ];

    await Promise.all(
      patterns.map((pattern) => cacheService.invalidatePattern(`${pattern}*`)),
    );
  }

  // Singleton management
  static initialize(
    prisma: PrismaClient,
    shiftService: ShiftManagementService,
    enhancementService: AttendanceEnhancementService,
  ): void {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(
        prisma,
        shiftService,
        enhancementService,
      );
    }
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      throw new Error('CacheManager not initialized');
    }
    return CacheManager.instance;
  }
}

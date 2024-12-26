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

export class CacheManager {
  private static instance: CacheManager | null = null;
  private static initPromise: Promise<void> | null = null;
  private initialized = false;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly shiftService: ShiftManagementService,
    private readonly enhancementService: AttendanceEnhancementService,
  ) {
    this.initialized = true;
  }

  static async initialize(
    prisma: PrismaClient,
    shiftService: ShiftManagementService,
    enhancementService: AttendanceEnhancementService,
  ): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          // If already initialized, just return
          if (CacheManager.instance?.initialized) {
            return;
          }

          // Create new instance
          CacheManager.instance = new CacheManager(
            prisma,
            shiftService,
            enhancementService,
          );

          // Any additional async initialization can go here
          // Note: Removed the connect call since it's not available
        } catch (error) {
          console.error('Failed to initialize CacheManager:', error);
          CacheManager.instance = null;
          throw error;
        }
      })();
    }
    return this.initPromise;
  }

  static getInstance(): CacheManager | null {
    if (!CacheManager.instance?.initialized) {
      return null;
    }
    return CacheManager.instance;
  }

  async getAttendanceState(
    employeeId: string,
  ): Promise<AttendanceStatusResponse | null> {
    if (!this.initialized || !cacheService || process.env.NODE_ENV === 'test') {
      return null;
    }

    const cacheKey = this.generateCacheKey(employeeId, 'attendance');
    try {
      const cached = await cacheService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Cache read failed:', error);
    }
    return null;
  }

  async cacheAttendanceState(
    employeeId: string,
    state: AttendanceStatusResponse,
    ttl = CACHE_CONSTANTS.ATTENDANCE_CACHE_TTL,
  ): Promise<void> {
    if (!this.initialized || !cacheService || process.env.NODE_ENV === 'test') {
      return;
    }

    const cacheKey = this.generateCacheKey(employeeId, 'attendance');
    try {
      await cacheService.set(cacheKey, JSON.stringify(state), ttl);
    } catch (error) {
      console.warn('Cache write failed:', error);
    }
  }

  private generateCacheKey(
    employeeId: string,
    type: 'attendance' | 'window' | 'validation',
  ): string {
    const date = format(getCurrentTime(), 'yyyy-MM-dd');
    return `${type}:${employeeId}:${date}`;
  }

  async invalidateCache(employeeId: string): Promise<void> {
    if (!this.initialized || !cacheService) {
      return;
    }

    const patterns = [
      this.generateCacheKey(employeeId, 'attendance'),
      this.generateCacheKey(employeeId, 'window'),
      this.generateCacheKey(employeeId, 'validation'),
    ];

    try {
      await Promise.all(
        patterns.map((pattern) =>
          cacheService.invalidatePattern(`${pattern}*`),
        ),
      );
    } catch (error) {
      console.warn('Cache invalidation failed:', error);
    }
  }
}

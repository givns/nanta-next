// services/OptimizedCacheService.ts

import { Redis } from 'ioredis';
import { AttendanceStatusInfo, LocationState } from '@/types/attendance';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
}

export class OptimizedCacheService {
  private client: Redis;
  private static instance: OptimizedCacheService;

  private constructor() {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('Redis URL not configured');
    this.client = new Redis(url);
  }

  static getInstance(): OptimizedCacheService {
    if (!this.instance) {
      this.instance = new OptimizedCacheService();
    }
    return this.instance;
  }

  private getKey(type: string, id: string, date?: string): string {
    return `${type}:${id}${date ? `:${date}` : ''}`;
  }

  async getAttendanceStatus(
    employeeId: string,
    location: LocationState,
    version: string,
  ): Promise<AttendanceStatusInfo | null> {
    const key = this.getKey(
      'attendance',
      employeeId,
      new Date().toISOString().split('T')[0],
    );
    const cached = await this.client.get(key);

    if (cached) {
      const entry: CacheEntry<AttendanceStatusInfo> = JSON.parse(cached);
      // Only return if cache version matches and location hasn't changed significantly
      if (
        entry.version === version &&
        this.isLocationValid(location, entry.data)
      ) {
        return entry.data;
      }
    }

    return null;
  }

  private isLocationValid(
    current: LocationState,
    cached: AttendanceStatusInfo,
  ): boolean {
    // Add logic to determine if location change is significant enough to invalidate cache
    return true; // Simplified for example
  }

  async setAttendanceStatus(
    employeeId: string,
    data: AttendanceStatusInfo,
    version: string,
    ttl: number = 300, // 5 minutes
  ): Promise<void> {
    const key = this.getKey(
      'attendance',
      employeeId,
      new Date().toISOString().split('T')[0],
    );
    const entry: CacheEntry<AttendanceStatusInfo> = {
      data,
      timestamp: Date.now(),
      version,
    };

    await this.client.set(key, JSON.stringify(entry), 'EX', ttl);
  }

  async invalidateEmployeeCache(employeeId: string): Promise<void> {
    const pattern = this.getKey('attendance', employeeId, '*');
    const keys = await this.client.keys(pattern);
    if (keys.length) {
      await this.client.del(...keys);
    }
  }
}

export const optimizedCacheService = OptimizedCacheService.getInstance();

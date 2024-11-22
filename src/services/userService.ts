// services/userService.ts

import axios from 'axios';
import { UserData } from '../types/user';
import { AttendanceStatusInfo } from '@/types/attendance';
import { cacheService } from './CacheService';
import { CACHE_CONSTANTS } from '@/types/attendance/base';

export class UserService {
  // Cache key patterns
  private static readonly CACHE_KEYS = {
    USER: (id: string) => `user:${id}`,
    ATTENDANCE: (id: string) => `attendance:${id}`,
    ALL_USER_DATA: (id: string) => `user:${id}*`,
  };

  // Cache TTL values
  private static readonly CACHE_TTL = {
    USER: CACHE_CONSTANTS.USER_CACHE_TTL,
    ATTENDANCE: 5 * 60, // 5 minutes
  };

  static async fetchUserData(lineUserId: string): Promise<UserData> {
    try {
      const response = await axios.get('/api/user-data', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      const userData = response.data.user;

      // Cache the user data using stale-while-revalidate pattern
      if (cacheService) {
        await cacheService.set(
          this.CACHE_KEYS.USER(lineUserId),
          JSON.stringify(userData),
          this.CACHE_TTL.USER,
        );
      }

      return userData;
    } catch (error) {
      console.error('Error fetching user data:', error);
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Unauthorized - Please log in again');
        }
        if (error.response?.status === 404) {
          throw new Error('User not found');
        }
        throw new Error(
          error.response?.data?.error || 'Failed to fetch user data',
        );
      }
      throw error;
    }
  }

  static async getUserData(lineUserId: string): Promise<UserData | null> {
    if (!cacheService) {
      return this.fetchUserData(lineUserId);
    }

    return cacheService.getWithSWR(
      this.CACHE_KEYS.USER(lineUserId),
      () => this.fetchUserData(lineUserId),
      this.CACHE_TTL.USER,
    );
  }

  static async getAttendanceStatus(
    lineUserId: string,
  ): Promise<AttendanceStatusInfo | null> {
    if (!cacheService) {
      return this.fetchAttendanceStatus(lineUserId);
    }

    return cacheService.getWithSWR(
      this.CACHE_KEYS.ATTENDANCE(lineUserId),
      () => this.fetchAttendanceStatus(lineUserId),
      this.CACHE_TTL.ATTENDANCE,
    );
  }

  private static async fetchAttendanceStatus(
    lineUserId: string,
  ): Promise<AttendanceStatusInfo> {
    try {
      const response = await axios.get('/api/attendance-status', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      return response.data.attendanceStatus;
    } catch (error) {
      console.error('Error fetching attendance status:', error);
      throw error;
    }
  }

  static async invalidateUserCache(lineUserId: string): Promise<void> {
    if (!cacheService) return;

    try {
      await Promise.all([
        cacheService.invalidatePattern(
          this.CACHE_KEYS.ALL_USER_DATA(lineUserId),
        ),
        cacheService.del(this.CACHE_KEYS.ATTENDANCE(lineUserId)),
      ]);
    } catch (error) {
      console.error('Error invalidating user cache:', error);
    }
  }

  static async refreshUserData(lineUserId: string): Promise<UserData> {
    await this.invalidateUserCache(lineUserId);
    return this.fetchUserData(lineUserId);
  }

  static async updateUserData(
    lineUserId: string,
    updates: Partial<UserData>,
  ): Promise<UserData> {
    try {
      const response = await axios.patch('/api/user-data', updates, {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      const updatedUserData = response.data.user;

      // Invalidate cache and set new data
      await this.invalidateUserCache(lineUserId);
      if (cacheService) {
        await cacheService.set(
          this.CACHE_KEYS.USER(lineUserId),
          JSON.stringify(updatedUserData),
          this.CACHE_TTL.USER,
        );
      }

      return updatedUserData;
    } catch (error) {
      console.error('Error updating user data:', error);
      throw error;
    }
  }

  // Helper method to handle API responses
  private static async handleApiResponse<T>(
    promise: Promise<any>,
    errorMessage: string,
  ): Promise<T> {
    try {
      const response = await promise;
      return response.data;
    } catch (error) {
      console.error(errorMessage, error);
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.error || errorMessage);
      }
      throw error;
    }
  }
}

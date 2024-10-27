// services/userService.ts
import axios from 'axios';
import { UserData } from '../types/user';
import { AttendanceStatusInfo } from '@/types/attendance';
import { cacheService } from './CacheService';

const USER_CACHE_TTL = 24 * 60 * 60; // 24 hours

export async function fetchUserData(lineUserId: string): Promise<UserData> {
  try {
    const response = await axios.get('/api/user-data', {
      headers: {
        'x-line-userid': lineUserId,
      },
    });

    const userData = response.data.user;

    // Cache the user data if cache service is available
    if (cacheService) {
      await cacheService.set(
        `user:${lineUserId}`,
        JSON.stringify(userData),
        USER_CACHE_TTL,
      );
    }

    return userData;
  } catch (error) {
    console.error('Error fetching user data:', error);
    if (axios.isAxiosError(error)) {
      // Handle specific error cases
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

export async function getCachedUserData(
  lineUserId: string,
): Promise<UserData | null> {
  try {
    if (!cacheService) return null;

    // Try to get from cache first
    const cachedData = await cacheService.get(`user:${lineUserId}`);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // If not in cache, fetch from API
    try {
      const response = await axios.get('/api/user-data', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      const userData = response.data.user;

      // Cache the fresh data
      await cacheService.set(
        `user:${lineUserId}`,
        JSON.stringify(userData),
        USER_CACHE_TTL,
      );

      return userData;
    } catch (error) {
      console.error('Error fetching user data for cache:', error);
      return null;
    }
  } catch (error) {
    console.error('Error getting cached user data:', error);
    return null;
  }
}

export async function getCachedAttendanceStatus(
  lineUserId: string,
): Promise<AttendanceStatusInfo | null> {
  try {
    if (!cacheService) return null;

    const cachedData = await cacheService.get(`attendance:${lineUserId}`);
    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // If not in cache, fetch from API
    try {
      const response = await axios.get('/api/attendance-status', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      const attendanceStatus = response.data.attendanceStatus;

      // Cache the fresh data
      await cacheService.set(
        `attendance:${lineUserId}`,
        JSON.stringify(attendanceStatus),
        60 * 5, // Cache for 5 minutes
      );

      return attendanceStatus;
    } catch (error) {
      console.error('Error fetching attendance status for cache:', error);
      return null;
    }
  } catch (error) {
    console.error('Error getting cached attendance status:', error);
    return null;
  }
}

// Add helper function to invalidate user cache
export async function invalidateUserCache(lineUserId: string): Promise<void> {
  if (!cacheService) return;

  try {
    await Promise.all([
      cacheService.del(`user:${lineUserId}`),
      cacheService.del(`attendance:${lineUserId}`),
    ]);
  } catch (error) {
    console.error('Error invalidating user cache:', error);
  }
}

// Add helper function to refresh user data
export async function refreshUserData(lineUserId: string): Promise<UserData> {
  await invalidateUserCache(lineUserId);
  return fetchUserData(lineUserId);
}

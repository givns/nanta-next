import axios from 'axios';
import { UserData } from '../types/user';
import { cacheService } from './CacheService';
import { AttendanceStatusInfo } from '@/types/attendance';

const USER_CACHE_TTL = 24 * 60 * 60; // 24 hours

export async function fetchUserData(lineUserId: string): Promise<UserData> {
  const response = await axios.get(`/api/user-data?lineUserId=${lineUserId}`);
  const userData = response.data.user;

  // Cache the user data
  if (cacheService) {
    await cacheService.set(
      `user:${lineUserId}`,
      JSON.stringify(userData),
      USER_CACHE_TTL,
    );
  }

  return userData;
}

export async function getCachedUserData(
  lineUserId: string,
): Promise<UserData | null> {
  if (!cacheService) return null;

  const cachedData = await cacheService.get(`user:${lineUserId}`);
  return cachedData ? JSON.parse(cachedData) : null;
}

export async function getCachedAttendanceStatus(
  lineUserId: string,
): Promise<AttendanceStatusInfo | null> {
  if (!cacheService) return null;

  const cachedData = await cacheService.get(`attendance:${lineUserId}`);
  return cachedData ? JSON.parse(cachedData) : null;
}

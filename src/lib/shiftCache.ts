// lib/shiftCache.ts

import { initializeServices } from '@/services/ServiceInitializer';
import { PrismaClient, Shift } from '@prisma/client';

const prisma = new PrismaClient();
const services = initializeServices(prisma);

// Client-side cache implementation
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds
const shiftCache = new Map<string, { data: Shift | null; timestamp: number }>();

export async function getShiftByCode(shiftCode: string): Promise<Shift | null> {
  const now = Date.now();
  const cached = shiftCache.get(shiftCode);

  // Return cached data if it's still valid
  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  // Fetch fresh data
  const shift = await services.shiftService.getShiftByCode(shiftCode);

  // Update cache
  shiftCache.set(shiftCode, {
    data: shift,
    timestamp: now,
  });

  return shift;
}

export async function getShiftById(shiftId: string): Promise<Shift | null> {
  const now = Date.now();
  const cached = shiftCache.get(shiftId);

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  const shift = await services.shiftService.getShiftById(shiftId);

  shiftCache.set(shiftId, {
    data: shift,
    timestamp: now,
  });

  return shift;
}

// Re-export other functions
export async function getShifts(): Promise<Shift[]> {
  return services.shiftService.getAllShifts();
}

export function getDefaultShiftCode(department: string): string {
  return services.shiftService.getDefaultShiftCodeForDepartment(department);
}

export const DEFAULT_SHIFTS: { [key: string]: Shift } = {
  SHIFT101: {
    id: 'SHIFT101',
    name: 'เข้างาน 6 โมง',
    shiftCode: 'SHIFT101',
    startTime: '06:00',
    endTime: '15:00',
    workDays: [1, 2, 3, 4, 5, 6],
  },
  SHIFT102: {
    id: 'SHIFT102',
    name: 'เข้างาน 7 โมง',
    shiftCode: 'SHIFT102',
    startTime: '07:00',
    endTime: '16:00',
    workDays: [1, 2, 3, 4, 5, 6],
  },
  SHIFT103: {
    id: 'SHIFT103',
    name: 'เข้างานช่วงเวลาปกติ',
    shiftCode: 'SHIFT103',
    startTime: '08:00',
    endTime: '17:00',
    workDays: [1, 2, 3, 4, 5, 6],
  },
  SHIFT104: {
    id: 'SHIFT104',
    name: 'เข้างานบ่าย 1 โมง',
    shiftCode: 'SHIFT104',
    startTime: '13:00',
    endTime: '22:00',
    workDays: [0, 1, 2, 3, 4, 5],
  },
  SHIFT105: {
    id: 'SHIFT105',
    name: 'เข้างาน 7 โมงครึ่ง',
    shiftCode: 'SHIFT105',
    startTime: '07:30',
    endTime: '15:30',
    workDays: [1, 2, 3, 4, 5, 6],
  },
};

// Get default shift data without DB query
export function getDefaultShiftByCode(shiftCode: string): Shift | null {
  return DEFAULT_SHIFTS[shiftCode] || null;
}

// Helper function to get shift data, first from defaults then from DB
export async function getShiftData(shiftCode: string): Promise<Shift | null> {
  // First try default shifts
  const defaultShift = getDefaultShiftByCode(shiftCode);
  if (defaultShift) {
    return defaultShift;
  }

  // If not in defaults, try DB
  return getShiftByCode(shiftCode);
}

export const departmentShiftMap = services.shiftService['departmentShiftMap'];

//lib/shiftCache.ts
import { ShiftManagementService } from '../services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { PrismaClient, Shift } from '@prisma/client';
import { cache } from 'react';

const prisma = new PrismaClient();
const shiftManagementService = new ShiftManagementService(
  prisma,
  new HolidayService(prisma),
);

const SHIFT_CACHE_DURATION = 3600 * 1000; // 1 hour
const shiftCache = new Map<string, { shift: Shift; timestamp: number }>();

export type DepartmentId = string;

export async function getShifts(): Promise<Shift[]> {
  return shiftManagementService.getAllShifts();
}

export const getShiftByCode = cache(
  async (shiftCode: string): Promise<Shift | null> => {
    const now = Date.now();
    const cached = shiftCache.get(shiftCode);

    if (cached && now - cached.timestamp < SHIFT_CACHE_DURATION) {
      return cached.shift;
    }

    const shift = await shiftManagementService.getShiftByCode(shiftCode);
    if (shift) {
      shiftCache.set(shiftCode, { shift, timestamp: now });
    }

    return shift;
  },
);

export const getShiftById = cache(
  async (shiftId: string): Promise<Shift | null> => {
    const now = Date.now();
    const cached = shiftCache.get(shiftId);

    if (cached && now - cached.timestamp < SHIFT_CACHE_DURATION) {
      return cached.shift;
    }

    const shift = await shiftManagementService.getShiftById(shiftId);
    if (shift) {
      shiftCache.set(shiftId, { shift, timestamp: now });
    }

    return shift;
  },
);

export async function refreshShiftCache(): Promise<void> {
  // This is no longer necessary, but kept for backwards compatibility
  console.warn('refreshShiftCache is deprecated and no longer necessary');
}

export const departmentShiftMap = shiftManagementService['departmentShiftMap'];

export function getDefaultShiftCode(department: string): string {
  return shiftManagementService.getDefaultShiftCodeForDepartment(department);
}

export async function getShiftByDepartmentId(
  departmentId: DepartmentId,
): Promise<Shift | null> {
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
  });
  if (!department) return null;
  return shiftManagementService.getShiftForDepartment(department.name);
}

export async function getDefaultShift(
  department: string,
): Promise<Shift | null> {
  return shiftManagementService.getShiftForDepartment(department);
}

// This function is no longer necessary, but kept for backwards compatibility
export function getDepartmentById(departmentId: DepartmentId): string | null {
  console.warn(
    'getDepartmentById is deprecated. Use prisma.department.findUnique instead',
  );
  return null;
}

// This function is no longer necessary, but kept for backwards compatibility
export function getDepartmentIdByName(
  departmentName: string,
): DepartmentId | null {
  console.warn(
    'getDepartmentIdByName is deprecated. Use prisma.department.findUnique instead',
  );
  return null;
}

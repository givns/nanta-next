import { ShiftManagementService } from '../services/ShiftManagementService';
import { HolidayService } from '@/services/HolidayService';
import { PrismaClient, Shift } from '@prisma/client';

const prisma = new PrismaClient();
const shiftManagementService = new ShiftManagementService(
  prisma,
  new HolidayService(prisma),
);

export type DepartmentId = string;

export async function getShifts(): Promise<Shift[]> {
  return shiftManagementService.getAllShifts();
}

export async function getShiftByCode(shiftCode: string): Promise<Shift | null> {
  return shiftManagementService.getShiftByCode(shiftCode);
}

export async function getShiftById(shiftId: string): Promise<Shift | null> {
  return shiftManagementService.getShiftById(shiftId);
}

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

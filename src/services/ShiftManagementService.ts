// services/ShiftManagementService.ts

import { PrismaClient, Shift, ShiftAdjustmentRequest } from '@prisma/client';
import {
  getShiftByDepartmentId,
  getDefaultShift,
  getDepartmentByNameFuzzy,
  getDepartmentIdByName,
  DepartmentId,
} from '../lib/shiftCache';

const prisma = new PrismaClient();

export class ShiftManagementService {
  async getDefaultShift(department: string): Promise<Shift | null> {
    console.log(`Getting default shift for department: ${department}`);
    const shift = await getDefaultShift(department);
    console.log(`Default shift result: ${JSON.stringify(shift)}`);
    return shift;
  }

  async assignShift(userId: string, department: string) {
    const matchedDepartment = getDepartmentByNameFuzzy(department);
    if (!matchedDepartment) {
      throw new Error(`No matching department found for: ${department}`);
    }

    const shift = await this.getDefaultShift(matchedDepartment);
    if (!shift) {
      throw new Error(
        `No default shift found for department: ${matchedDepartment}`,
      );
    }

    await this.createDepartmentIfNotExists(matchedDepartment);

    return prisma.user.update({
      where: { id: userId },
      data: { shiftId: shift.id },
    });
  }

  // ... other methods remain the same ...

  async getShiftByDepartmentId(
    departmentId: DepartmentId,
  ): Promise<Shift | null> {
    return getShiftByDepartmentId(departmentId);
  }

  async createDepartmentIfNotExists(departmentName: string): Promise<void> {
    const department = await prisma.department.findFirst({
      where: { name: { contains: departmentName, mode: 'insensitive' } },
    });

    if (!department) {
      const departmentId = getDepartmentIdByName(departmentName);
      if (departmentId === null) {
        throw new Error(`Invalid department name: ${departmentName}`);
      }
      await prisma.department.create({
        data: {
          id: departmentId.toString(), // Assuming your Prisma schema uses string IDs
          name: departmentName,
        },
      });
    }
  }

  async getDepartmentId(departmentName: string): Promise<string | null> {
    const departmentId = getDepartmentIdByName(departmentName);
    if (departmentId === null) {
      return null;
    }
    return departmentId.toString(); // Convert to string if your Prisma schema uses string IDs
  }
}

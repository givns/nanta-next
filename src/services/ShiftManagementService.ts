// services/ShiftManagementService.ts

import { PrismaClient, Shift, ShiftAdjustmentRequest } from '@prisma/client';
import {
  getShiftByDepartmentId,
  getDefaultShift,
  getDepartmentByNameFuzzy,
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

  async requestShiftAdjustment(
    userId: string,
    requestedShiftId: string,
    date: Date,
    reason: string,
  ): Promise<ShiftAdjustmentRequest> {
    return prisma.shiftAdjustmentRequest.create({
      data: {
        userId,
        requestedShiftId,
        date,
        reason,
        status: 'pending',
      },
    });
  }

  async getShiftAdjustmentForDate(
    userId: string,
    date: Date,
  ): Promise<ShiftAdjustmentRequest | null> {
    const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    try {
      const adjustment = await prisma.shiftAdjustmentRequest.findFirst({
        where: {
          userId,
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          status: 'approved',
        },
        include: {
          requestedShift: true,
        },
      });
      return adjustment;
    } catch (error) {
      console.error('Error fetching shift adjustment request:', error);
      return null;
    }
  }

  async approveShiftAdjustment(id: string): Promise<ShiftAdjustmentRequest> {
    return prisma.shiftAdjustmentRequest.update({
      where: { id },
      data: { status: 'approved' },
    });
  }

  async rejectShiftAdjustment(id: string): Promise<ShiftAdjustmentRequest> {
    return prisma.shiftAdjustmentRequest.update({
      where: { id },
      data: { status: 'rejected' },
    });
  }

  async getUserShift(userId: string): Promise<Shift | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    return user?.assignedShift || null;
  }

  async getShiftAdjustmentRequests(
    status?: 'pending' | 'approved' | 'rejected',
  ): Promise<ShiftAdjustmentRequest[]> {
    return prisma.shiftAdjustmentRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        user: true,
        requestedShift: true,
      },
    });
  }

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
      await prisma.department.create({
        data: { name: departmentName },
      });
    }
  }

  async getDepartmentId(departmentName: string): Promise<string | null> {
    console.log(`Attempting to get department ID for: ${departmentName}`);
    const department = await prisma.department.findFirst({
      where: { name: { equals: departmentName, mode: 'insensitive' } },
    });
    if (department) {
      console.log(`Found department ID: ${department.id}`);
      return department.id;
    } else {
      console.log(
        `Department not found, attempting to create: ${departmentName}`,
      );
      const newDepartment = await prisma.department.create({
        data: {
          name: departmentName,
          daysOff: { create: [] }, // Add this if you want to initialize with empty daysOff
        },
      });
      console.log(`Created new department with ID: ${newDepartment.id}`);
      return newDepartment.id;
    }
  }
}

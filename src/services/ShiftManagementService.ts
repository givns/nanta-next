// services/ShiftManagementService.ts

import {
  PrismaClient,
  Shift,
  ShiftAdjustmentRequest,
  User,
} from '@prisma/client';
import { NotificationService } from './NotificationService';
import {
  getDepartmentByNameFuzzy,
  getDefaultShift,
  DepartmentId,
} from '../lib/shiftCache';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

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
    const adjustment = await prisma.shiftAdjustmentRequest.create({
      data: {
        userId,
        requestedShiftId,
        date,
        reason,
        status: 'approved', // Automatically approve the request
      },
    });

    await notificationService.sendNotification(
      userId,
      `Your shift for ${date.toDateString()} has been adjusted.`,
    );

    return adjustment;
  }

  async adminCreateShiftAdjustment(
    adminId: string,
    targetType: 'department' | 'individual',
    targetId: string,
    requestedShiftId: string,
    date: Date,
    reason: string,
  ): Promise<ShiftAdjustmentRequest[]> {
    const adjustments: ShiftAdjustmentRequest[] = [];

    if (targetType === 'department') {
      const users = await prisma.user.findMany({
        where: { departmentId: targetId },
      });

      for (const user of users) {
        const adjustment = await this.requestShiftAdjustment(
          user.id,
          requestedShiftId,
          date,
          reason,
        );
        adjustments.push(adjustment);
      }
    } else {
      const adjustment = await this.requestShiftAdjustment(
        targetId,
        requestedShiftId,
        date,
        reason,
      );
      adjustments.push(adjustment);
    }

    // Notify super admins (except the admin who made the adjustment)
    const superAdmins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', NOT: { id: adminId } },
    });
    for (const superAdmin of superAdmins) {
      await notificationService.sendNotification(
        superAdmin.id,
        `Admin ${adminId} has adjusted shifts for ${targetType} ${targetId} on ${date.toDateString()}.`,
      );
    }

    return adjustments;
  }

  async getEffectiveShift(userId: string, date: Date): Promise<Shift> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user || !user.assignedShift) {
      throw new Error('User or assigned shift not found');
    }

    const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId,
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
        status: 'approved',
      },
      include: { requestedShift: true },
    });

    return shiftAdjustment
      ? shiftAdjustment.requestedShift
      : user.assignedShift;
  }

  async getUserShift(userId: string): Promise<Shift | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    return user?.assignedShift || null;
  }

  async getShiftAdjustmentRequests(
    status?: 'approved',
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
    return getDefaultShift(departmentId.toString());
  }

  async createDepartmentIfNotExists(departmentName: string): Promise<string> {
    console.log(`Checking if department exists: ${departmentName}`);

    // Use a transaction to ensure atomicity
    return await prisma.$transaction(async (tx) => {
      let department = await tx.department.findFirst({
        where: {
          name: {
            equals: departmentName,
            mode: 'insensitive',
          },
        },
      });

      if (!department) {
        console.log(`Department not found, creating: ${departmentName}`);
        try {
          department = await tx.department.create({
            data: {
              name: departmentName,
              // Add any other necessary fields here
            },
          });
          console.log(`Created new department with ID: ${department.id}`);
        } catch (error: any) {
          // Check if the error is due to a unique constraint violation
          if (error.code === 'P2002') {
            console.log(
              `Department was created concurrently, fetching existing one`,
            );
            department = await tx.department.findFirst({
              where: {
                name: {
                  equals: departmentName,
                  mode: 'insensitive',
                },
              },
            });
          } else {
            throw error;
          }
        }
      } else {
        console.log(`Found existing department with ID: ${department.id}`);
      }

      return department.id;
    });
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
          daysOff: { create: [] },
        },
      });
      console.log(`Created new department with ID: ${newDepartment.id}`);
      return newDepartment.id;
    }
  }
}

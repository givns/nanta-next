// services/ShiftManagementService.ts

import { PrismaClient, Shift, ShiftAdjustmentRequest } from '@prisma/client';
import { NotificationService } from './NotificationService';
import { DepartmentMappingService } from './DepartmentMappingService';
import { ShiftData, ShiftAdjustment } from '@/types/user';

const prisma = new PrismaClient();
const notificationService = new NotificationService();
const departmentMappingService = new DepartmentMappingService();

export class ShiftManagementService {
  async RequestShiftAdjustment(
    userId: string,
  ): Promise<ShiftAdjustment | null> {
    try {
      const latestAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
        where: {
          userId: userId,
          status: 'approved',
          date: {
            gte: new Date(), // Only get adjustments from today onwards
          },
        },
        orderBy: {
          date: 'asc',
        },
        include: {
          requestedShift: true,
        },
      });

      if (!latestAdjustment) {
        return null;
      }

      return {
        id: latestAdjustment.id,
        userId: latestAdjustment.userId,
        date: latestAdjustment.date.toISOString(),
        requestedShiftId: latestAdjustment.requestedShiftId,
        requestedShift: this.convertToShiftData(
          latestAdjustment.requestedShift,
        ),
        status: latestAdjustment.status,
        reason: latestAdjustment.reason,
        createdAt: latestAdjustment.createdAt,
        updatedAt: latestAdjustment.updatedAt,
      };
    } catch (error) {
      console.error('Error in RequestShiftAdjustment:', error);
      throw error;
    }
  }

  private convertToShiftData(shift: Shift): ShiftData {
    return {
      id: shift.id,
      shiftCode: shift.shiftCode,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays,
    };
  }

  async getDefaultShift(departmentId: string): Promise<Shift | null> {
    console.log(`Getting default shift for department ID: ${departmentId}`);
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { defaultShift: true },
    });
    const shift = department?.defaultShift;
    console.log(`Default shift result: ${JSON.stringify(shift)}`);
    return shift || null;
  }

  async assignShift(userId: string, departmentId: string) {
    const shift = await this.getDefaultShift(departmentId);
    if (!shift) {
      throw new Error(
        `No default shift found for department ID: ${departmentId}`,
      );
    }

    return prisma.user.update({
      where: { id: userId },
      data: { shiftId: shift.id, departmentId },
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
        status: 'approved',
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

  async getEffectiveShift(
    userId: string,
    date: Date,
  ): Promise<{ shift: ShiftData; shiftStart: Date; shiftEnd: Date } | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { assignedShift: true },
      });

      if (!user || !user.assignedShift) {
        console.error('User or assigned shift not found');
        return null;
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

      const effectiveShift = shiftAdjustment
        ? shiftAdjustment.requestedShift
        : user.assignedShift;

      const shiftStart = new Date(date);
      const shiftEnd = new Date(date);

      const [startHour, startMinute] = effectiveShift.startTime
        .split(':')
        .map(Number);
      const [endHour, endMinute] = effectiveShift.endTime
        .split(':')
        .map(Number);

      shiftStart.setHours(startHour, startMinute, 0, 0);
      shiftEnd.setHours(endHour, endMinute, 0, 0);

      // Handle overnight shifts
      if (shiftEnd <= shiftStart) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      const effectiveShiftData = this.convertToShiftData(effectiveShift);

      return { shift: effectiveShiftData, shiftStart, shiftEnd };
    } catch (error) {
      console.error('Error in getEffectiveShift:', error);
      return null;
    }
  }

  async getFutureShiftAdjustments(userId: string): Promise<ShiftAdjustment[]> {
    const adjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        userId,
        date: { gte: new Date() },
        status: 'approved',
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return adjustments.map((adj) => ({
      id: adj.id,
      userId: adj.userId,
      date: adj.date.toISOString(),
      requestedShiftId: adj.requestedShiftId,
      requestedShift: this.convertToShiftData(adj.requestedShift),
      status: adj.status,
      reason: adj.reason,
      createdAt: adj.createdAt,
      updatedAt: adj.updatedAt,
    }));
  }

  async getShiftAdjustmentForDate(
    userId: string,
    date: Date,
  ): Promise<ShiftAdjustmentRequest | null> {
    const adjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId,
        date: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
        status: 'approved',
      },
      include: { requestedShift: true },
    });

    if (!adjustment) return null;

    return {
      id: adjustment.id,
      userId: adjustment.userId,
      requestedShiftId: adjustment.requestedShiftId,
      date: adjustment.date,
      reason: adjustment.reason,
      status: adjustment.status,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    };
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

  async getShiftByDepartmentId(departmentId: string): Promise<Shift | null> {
    console.log(
      `ShiftManagementService: Getting shift for department ID: ${departmentId}`,
    );
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: { defaultShift: true },
    });
    console.log(`Department found: ${JSON.stringify(department, null, 2)}`);
    const shift = department?.defaultShift;
    console.log(`Default shift result: ${JSON.stringify(shift)}`);
    return shift || null;
  }

  async getDepartmentId(
    externalDepartmentId: number,
  ): Promise<string | undefined> {
    return departmentMappingService.getInternalId(externalDepartmentId);
  }
}

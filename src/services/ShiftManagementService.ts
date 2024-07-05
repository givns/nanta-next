// services/ShiftManagementService.ts

import { PrismaClient, Shift, ShiftAdjustmentRequest } from '@prisma/client';
import {
  getShifts,
  getShiftByCode,
  getDefaultShiftCode,
} from '../lib/shiftCache';

const prisma = new PrismaClient();

export class ShiftManagementService {
  async getDefaultShift(department: string): Promise<Shift | null> {
    const shiftCode = getDefaultShiftCode(department);
    return await getShiftByCode(shiftCode);
  }

  async assignShift(userId: string, department: string) {
    const shift = await this.getDefaultShift(department);
    if (!shift) {
      throw new Error(`No default shift found for department: ${department}`);
    }

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
  ): Promise<(ShiftAdjustmentRequest & { requestedShift: Shift }) | null> {
    return prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId,
        date: {
          gte: new Date(date.setHours(0, 0, 0, 0)),
          lt: new Date(date.setHours(23, 59, 59, 999)),
        },
        status: 'approved',
      },
      include: {
        requestedShift: true,
      },
    });
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
}

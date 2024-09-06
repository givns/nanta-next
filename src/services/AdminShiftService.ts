// services/AdminShiftService.ts

import prisma from '../lib/prisma';
import { Shift } from '../types/user';
import { ShiftAdjustmentRequest } from '@prisma/client';

export class AdminShiftService {
  async getAllShifts(): Promise<Shift[]> {
    return prisma.shift.findMany();
  }

  async getShiftById(shiftId: string): Promise<Shift | null> {
    return prisma.shift.findUnique({
      where: { id: shiftId },
    });
  }

  async getDepartments(): Promise<{ id: string; name: string }[]> {
    return prisma.department.findMany({
      select: { id: true, name: true },
    });
  }

  async createShiftAdjustment(
    employeeId: string,
    shiftId: string,
    date: Date,
    reason: string,
  ): Promise<ShiftAdjustmentRequest> {
    return prisma.shiftAdjustmentRequest.create({
      data: {
        employeeId,
        requestedShiftId: shiftId,
        date,
        reason,
        status: 'pending',
      },
    });
  }

  async getShiftAdjustments(
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
}

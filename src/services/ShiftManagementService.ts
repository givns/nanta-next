// services/ShiftManagementService.ts

import { PrismaClient, Shift } from '@prisma/client';
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
  ) {
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
}

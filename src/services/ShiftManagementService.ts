// services/ShiftManagementService.ts

import { Shift } from '@prisma/client';
import {
  getShifts,
  getShiftByCode,
  getDefaultShiftCode,
} from '../lib/shiftCache';
import prisma from '../lib/prisma';

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
}

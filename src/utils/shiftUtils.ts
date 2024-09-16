// utils/shiftUtils.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getShiftDetails(shiftCode: string) {
  const shift = await prisma.shift.findUnique({
    where: { shiftCode },
  });

  if (!shift) {
    throw new Error(`Shift not found for code: ${shiftCode}`);
  }

  return shift;
}

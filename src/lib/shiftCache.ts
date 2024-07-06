// lib/shiftCache.ts

import { PrismaClient, Shift } from '@prisma/client';

const prisma = new PrismaClient();

let shifts: Shift[] | null = null;

export async function getShifts(): Promise<Shift[]> {
  if (shifts === null) {
    shifts = await prisma.shift.findMany();
    if (shifts.length === 0) {
      const shiftData = [
        {
          shiftCode: 'SHIFT101',
          name: 'กะเช้า 6 โมง',
          startTime: '06:00',
          endTime: '15:00',
        },
        {
          shiftCode: 'SHIFT102',
          name: 'กะเช้า 7 โมง',
          startTime: '07:00',
          endTime: '16:00',
        },
        {
          shiftCode: 'SHIFT103',
          name: 'ช่วงเวลาปกติ',
          startTime: '08:00',
          endTime: '17:00',
        },
        {
          shiftCode: 'SHIFT104',
          name: 'กะบ่าย 2 โมง',
          startTime: '14:00',
          endTime: '23:00',
        },
      ];

      shifts = await Promise.all(
        shiftData.map((shift) =>
          prisma.shift.upsert({
            where: { shiftCode: shift.shiftCode },
            update: shift,
            create: shift,
          }),
        ),
      );
    }
  }
  return shifts;
}

export async function getShiftByCode(shiftCode: string): Promise<Shift | null> {
  const allShifts = await getShifts();
  return allShifts.find((shift) => shift.shiftCode === shiftCode) || null;
}

export async function getShiftById(shiftId: string): Promise<Shift | null> {
  const allShifts = await getShifts();
  return allShifts.find((shift) => shift.id === shiftId) || null;
}

export async function refreshShiftCache(): Promise<void> {
  shifts = null;
  await getShifts();
}

export const departmentShiftMap: { [key: string]: string } = {
  ฝ่ายขนส่ง: 'SHIFT101',
  ฝ่ายปฏิบัติการ: 'SHIFT103',
  'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)': 'SHIFT104',
  'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)': 'SHIFT101',
  'ฝ่ายผลิต-คัดคุณภาพและบรรจุ': 'SHIFT103',
  'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง': 'SHIFT103',
  'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์': 'SHIFT102',
  ฝ่ายประกันคุณภาพ: 'SHIFT103',
  ฝ่ายคลังสินค้าและแพ็คกิ้ง: 'SHIFT103',
  ฝ่ายจัดส่งสินค้า: 'SHIFT103',
  ฝ่ายจัดซื้อและประสานงานขาย: 'SHIFT103',
  ฝ่ายบัญชีและการเงิน: 'SHIFT103',
  ฝ่ายทรัพยากรบุคคล: 'SHIFT103',
  ฝ่ายรักษาความสะอาด: 'SHIFT102',
  ฝ่ายรักษาความปลอดภัย: 'SHIFT102',
};

export async function getShiftByDepartmentId(
  department: string,
): Promise<Shift | null> {
  const shiftCode = departmentShiftMap[department];
  if (shiftCode) {
    return getShiftByCode(shiftCode);
  }
  return getShiftByCode('SHIFT103'); // Default to SHIFT103 if no match
}

export async function getDefaultShift(
  department: string,
): Promise<Shift | null> {
  const shiftCode = departmentShiftMap[department] || 'SHIFT103';
  return getShiftByCode(shiftCode);
}

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

export function getDefaultShiftCode(department: string): string {
  return departmentShiftMap[department] || 'SHIFT103';
}

// lib/shiftCache.ts

// ... (previous code remains the same)

// Add this mapping of department IDs to department names
const departmentIdNameMap: { [key: number]: string } = {
  10001: 'ฝ่ายขนส่ง',
  10002: 'ฝ่ายปฏิบัติการ',
  10003: 'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)',
  10004: 'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)',
  10005: 'ฝ่ายผลิต-คัดคุณภาพและบรรจุ',
  10006: 'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง',
  10007: 'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์',
  10008: 'ฝ่ายประกันคุณภาพ',
  10009: 'ฝ่ายคลังสินค้าและแพ็คกิ้ง',
  10010: 'ฝ่ายจัดส่งสินค้า',
  10011: 'ฝ่ายจัดซื้อและประสานงานขาย',
  10012: 'ฝ่ายบัญชีและการเงิน',
  10013: 'ฝ่ายทรัพยากรบุคคล',
  10014: 'ฝ่ายรักษาความสะอาด',
  10015: 'ฝ่ายรักษาความปลอดภัย',
  // Add more mappings as needed
};

export async function getShiftByDepartmentId(
  departmentId: number,
): Promise<Shift | null> {
  const departmentName = departmentIdNameMap[departmentId];
  if (!departmentName) {
    console.warn(`No department name found for ID: ${departmentId}`);
    return getShiftByCode('SHIFT103'); // Default shift if department not found
  }

  const shiftCode = departmentShiftMap[departmentName];
  if (!shiftCode) {
    console.warn(`No shift code found for department: ${departmentName}`);
    return getShiftByCode('SHIFT103'); // Default shift if no mapping found
  }

  const shift = await getShiftByCode(shiftCode);
  if (!shift) {
    console.warn(`No shift found for code: ${shiftCode}`);
    return getShiftByCode('SHIFT103'); // Default shift if shift not found
  }

  return shift;
}

export async function getDefaultShift(
  department: string,
): Promise<Shift | null> {
  const shiftCode = getDefaultShiftCode(department);
  return getShiftByCode(shiftCode);
}

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
          workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
        },
        {
          shiftCode: 'SHIFT102',
          name: 'กะเช้า 7 โมง',
          startTime: '07:00',
          endTime: '16:00',
          workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
        },
        {
          shiftCode: 'SHIFT103',
          name: 'ช่วงเวลาปกติ',
          startTime: '08:00',
          endTime: '17:00',
          workDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
        },
        {
          shiftCode: 'SHIFT104',
          name: 'กะบ่าย 2 โมง',
          startTime: '14:00',
          endTime: '23:00',
          workDays: [0, 1, 2, 3, 4, 5], // Sunday to Friday
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
export type DepartmentId =
  | 10012
  | 10038
  | 10030
  | 10031
  | 10032
  | 10049
  | 10053
  | 10022
  | 10010
  | 10011
  | 10037
  | 10013
  | 10016
  | 10020;

export const departmentIdNameMap: { [key: number]: string } = {
  10012: 'ฝ่ายจัดส่งสินค้า',
  10038: 'ฝ่ายปฏิบัติการ',
  10030: 'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)',
  10031: 'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)',
  10032: 'ฝ่ายผลิต-คัดคุณภาพและบรรจุ',
  10049: 'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง',
  10053: 'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์',
  10022: 'ฝ่ายประกันคุณภาพ',
  10010: 'ฝ่ายคลังสินค้าและแพ็คกิ้ง',
  10011: 'ฝ่ายจัดซื้อและประสานงานขาย',
  10037: 'ฝ่ายบัญชีและการเงิน',
  10013: 'ฝ่ายทรัพยากรบุคคล',
  10016: 'ฝ่ายรักษาความสะอาด',
  10020: 'ฝ่ายรักษาความปลอดภัย',
};
export function getDepartmentById(departmentId: number): string | null {
  return departmentIdNameMap[departmentId] || null;
}

export async function getShiftByDepartmentId(
  departmentId: DepartmentId,
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

  try {
    const shift = await getShiftByCode(shiftCode);
    if (!shift) {
      console.warn(`No shift found for code: ${shiftCode}`);
      return getShiftByCode('SHIFT103'); // Default shift if shift not found
    }
    return shift;
  } catch (error) {
    console.error(
      `Error getting shift for department ID ${departmentId}:`,
      error,
    );
    return getShiftByCode('SHIFT103');
  }
}

function fuzzyMatch(str1: string, str2: string): number {
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  let score = 0;
  for (let i = 0; i < str1.length; i++) {
    if (str2.includes(str1[i])) {
      score++;
    }
  }
  return score / Math.max(str1.length, str2.length);
}

export function getDepartmentIdByName(
  departmentName: string,
): DepartmentId | null {
  for (const [id, name] of Object.entries(departmentIdNameMap)) {
    if (name === departmentName) {
      return Number(id) as DepartmentId;
    }
  }
  return null;
}

export function getDepartmentByNameFuzzy(name: string): string | null {
  let bestMatch = null;
  let bestScore = 0;

  for (const depName of Object.values(departmentIdNameMap)) {
    const score = fuzzyMatch(name, depName);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = depName;
    }
  }

  // Only return a match if the score is above a certain threshold
  return bestScore > 0.7 ? bestMatch : null;
}

export async function getDefaultShift(
  department: string,
): Promise<Shift | null> {
  const shiftCode = getDefaultShiftCode(department);
  return getShiftByCode(shiftCode);
}

// services/ShiftManagementService.ts

// services/ShiftManagementService.ts

import { PrismaClient, Shift } from '@prisma/client';

const prisma = new PrismaClient();

export class ShiftManagementService {
  async initializeShifts() {
    const shifts = [
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

    for (const shift of shifts) {
      await prisma.shift.upsert({
        where: { shiftCode: shift.shiftCode },
        update: shift,
        create: shift,
      });
    }
  }

  async areShiftsInitialized(): Promise<boolean> {
    const count = await prisma.shift.count();
    return count > 0;
  }

  async getDefaultShift(department: string): Promise<Shift | null> {
    console.log(`Getting default shift for department: ${department}`);
    const departmentShiftMap: { [key: string]: string } = {
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

    const shiftCode = departmentShiftMap[department] || 'SHIFT103'; // Default to 'SHIFT103' if no match
    console.log(`Mapped shift code: ${shiftCode}`);

    const shift = await prisma.shift.findUnique({
      where: { shiftCode },
    });

    if (!shift) {
      console.log(`No shift found for code: ${shiftCode}`);
    } else {
      console.log(`Found shift:`, shift);
    }

    return shift;
  }
  async listAllShifts(): Promise<Shift[]> {
    return prisma.shift.findMany();
  }

  async assignShift(userId: string, department: string) {
    const departmentShiftMap: { [key: string]: string } = {
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

    const shiftCode = departmentShiftMap[department] || 'SHIFT103';

    const shift = await prisma.shift.findUnique({
      where: { shiftCode },
    });

    if (!shift) {
      throw new Error(`No shift found for department: ${department}`);
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

  async approveShiftAdjustment(requestId: string) {
    const request = await prisma.shiftAdjustmentRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
      include: { user: true },
    });

    await prisma.user.update({
      where: { id: request.userId },
      data: { shiftId: request.requestedShiftId },
    });

    return request;
  }
}

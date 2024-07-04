// services/ShiftManagementService.ts

import { PrismaClient, Shift } from '@prisma/client';

const prisma = new PrismaClient();

export class ShiftManagementService {
  async initializeShifts() {
    const shifts = [
      {
        id: '101',
        shiftCode: 'SHIFT101',
        name: 'กะเช้า 6 โมง',
        startTime: '06:00',
        endTime: '15:00',
      },
      {
        id: '102',
        shiftCode: 'SHIFT102',
        name: 'กะเช้า 7 โมง',
        startTime: '07:00',
        endTime: '16:00',
      },
      {
        id: '103',
        shiftCode: 'SHIFT103',
        name: 'ช่วงเวลาปกติ',
        startTime: '08:00',
        endTime: '17:00',
      },
      {
        id: '104',
        shiftCode: 'SHIFT104',
        name: 'กะบ่าย 2 โมง',
        startTime: '14:00',
        endTime: '23:00',
      },
    ];

    for (const shift of shifts) {
      await prisma.shift.upsert({
        where: { id: shift.id },
        update: shift,
        create: shift,
      });
    }
  }
  async assignShift(userId: string, department: string) {
    const departmentShiftMap: { [key: string]: string } = {
      ฝ่ายขนส่ง: '101',
      ฝ่ายปฏิบัติการ: '103',
      'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)': '104',
      'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)': '101',
      'ฝ่ายผลิต-คัดคุณภาพและบรรจุ': '103',
      'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง': '103',
      'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์': '102',
      ฝ่ายประกันคุณภาพ: '103',
      ฝ่ายคลังสินค้าและแพ็คกิ้ง: '103',
      ฝ่ายจัดส่งสินค้า: '103',
      ฝ่ายจัดซื้อและประสานงานขาย: '103',
      ฝ่ายบัญชีและการเงิน: '103',
      ฝ่ายทรัพยากรบุคคล: '103',
      ฝ่ายรักษาความสะอาด: '102',
      ฝ่ายรักษาความปลอดภัย: '102',
    };

    const shiftId = departmentShiftMap[department] || '103'; // Default to '103' if no match

    return prisma.user.update({
      where: { id: userId },
      data: { shiftId },
    });
  }
  async getDefaultShift(department: string): Promise<Shift | null> {
    const departmentShiftMap: { [key: string]: string } = {
      ฝ่ายขนส่ง: '101',
      ฝ่ายปฏิบัติการ: '103',
      'ฝ่ายผลิต-กระบวนการที่ 1 (บ่าย)': '104',
      'ฝ่ายผลิต-กระบวนการที่ 2 (เช้า)': '101',
      'ฝ่ายผลิต-คัดคุณภาพและบรรจุ': '103',
      'ฝ่ายผลิต-ข้าวเกรียบ-ข้าวตัง': '103',
      'ฝ่ายผลิต-วิจัยและพัฒนาคุณภาพผลิตภัณฑ์': '102',
      ฝ่ายประกันคุณภาพ: '103',
      ฝ่ายคลังสินค้าและแพ็คกิ้ง: '103',
      ฝ่ายจัดส่งสินค้า: '103',
      ฝ่ายจัดซื้อและประสานงานขาย: '103',
      ฝ่ายบัญชีและการเงิน: '103',
      ฝ่ายทรัพยากรบุคคล: '103',
      ฝ่ายรักษาความสะอาด: '102',
      ฝ่ายรักษาความปลอดภัย: '102',
    };

    const shiftId = departmentShiftMap[department] || '103'; // Default to '103' if no match

    return prisma.shift.findUnique({
      where: { id: shiftId },
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

import { ShiftAdjustment } from '@/types/attendance';
import {
  PrismaClient,
  Shift,
  ShiftAdjustmentRequest,
  Department,
  User,
} from '@prisma/client';
import { ShiftData } from '@/types/attendance';
import { endOfDay, startOfDay } from 'date-fns';

export class ShiftManagementService {
  constructor(private prisma: PrismaClient) {}

  private departmentShiftMap: { [key: string]: string } = {
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
    ฝ่ายจัดซื้อและประสานงาน: 'SHIFT103',
    ฝ่ายบริหารงานขาย: 'SHIFT103',
    ฝ่ายบัญชีและการเงิน: 'SHIFT103',
    ฝ่ายทรัพยากรบุคคล: 'SHIFT103',
    ฝ่ายรักษาความสะอาด: 'SHIFT102',
    ฝ่ายรักษาความปลอดภัย: 'SHIFT102',
  };

  async getEffectiveShift(
    employeeId: string,
    date: Date,
  ): Promise<ShiftData | null> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId: employeeId },
    });
    if (!user) return null;

    const shiftAdjustment = await this.getShiftAdjustmentForDate(
      employeeId,
      date,
    );
    if (shiftAdjustment && shiftAdjustment.status === 'approved') {
      return this.convertToShiftData(shiftAdjustment.requestedShift);
    }

    if (!user.shiftCode) {
      return null;
    }

    const shift = await this.getShiftByCode(user.shiftCode);
    return shift ? this.convertToShiftData(shift) : null;
  }

  private convertToShiftData(shift: Shift): ShiftData {
    return {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays,
      shiftCode: shift.shiftCode,
    };
  }

  async getAllShifts(): Promise<Shift[]> {
    return this.prisma.shift.findMany();
  }

  async getShiftByCode(shiftCode: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({ where: { shiftCode } });
  }

  async getUserShift(userId: string): Promise<Shift | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { shiftCode: true },
    });

    if (!user || !user.shiftCode) return null;

    return this.getShiftByCode(user.shiftCode);
  }

  async getShiftById(shiftId: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({ where: { id: shiftId } });
  }

  getDefaultShiftCodeForDepartment(departmentName: string): string {
    return this.departmentShiftMap[departmentName] || 'SHIFT103';
  }

  async getDepartmentByName(
    departmentName: string,
  ): Promise<Department | null> {
    return this.prisma.department.findUnique({
      where: { name: departmentName },
    });
  }

  async getShiftForDepartment(departmentName: string): Promise<Shift | null> {
    const shiftCode = this.getDefaultShiftCodeForDepartment(departmentName);
    return this.getShiftByCode(shiftCode);
  }

  async assignShiftToUser(userId: string, shiftCode: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { shiftCode: shiftCode },
    });
  }

  async getShiftAdjustmentForDate(
    userId: string,
    date: Date,
  ): Promise<ShiftAdjustment | null> {
    const adjustment = await this.prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId: userId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
      },
      include: { requestedShift: true },
    });

    if (!adjustment) return null;

    return {
      date: adjustment.date.toISOString(),
      requestedShiftId: adjustment.requestedShiftId,
      requestedShift: adjustment.requestedShift,
      status: adjustment.status as 'pending' | 'approved' | 'rejected',
      reason: adjustment.reason,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.updatedAt,
    };
  }

  async requestShiftAdjustment(
    userId: string,
    date: Date,
    newShiftId: string,
  ): Promise<ShiftAdjustmentRequest> {
    return this.prisma.shiftAdjustmentRequest.create({
      data: {
        employeeId: userId,
        date: date,
        requestedShiftId: newShiftId,
        status: 'pending',
        reason: '', // Add the reason property with an empty string value
      },
    });
  }

  async getFutureShifts(
    employeeId: string,
    startDate: Date,
  ): Promise<Array<{ date: string; shift: Shift }>> {
    const futureShifts = await this.prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
        date: { gte: startDate },
        status: 'approved',
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return futureShifts.map((adjustment) => ({
      date: adjustment.date.toISOString(),
      shift: {
        id: adjustment.requestedShift.id,
        name: adjustment.requestedShift.name,
        startTime: adjustment.requestedShift.startTime,
        endTime: adjustment.requestedShift.endTime,
        workDays: adjustment.requestedShift.workDays,
        shiftCode: adjustment.requestedShift.shiftCode,
      },
    }));
  }

  async getAllDepartments(): Promise<Department[]> {
    return this.prisma.department.findMany();
  }
}

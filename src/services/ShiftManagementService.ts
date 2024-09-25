import { ShiftAdjustment } from '@/types/attendance';
import {
  PrismaClient,
  Shift,
  ShiftAdjustmentRequest,
  Department,
  User,
} from '@prisma/client';
import axios from 'axios';
import { ShiftData } from '@/types/attendance';
import {
  endOfDay,
  startOfDay,
  addMinutes,
  isBefore,
  isAfter,
  addDays,
  setHours,
  setMinutes,
} from 'date-fns';
import {
  formatDateTime,
  formatTime,
  getCurrentTime,
  toBangkokTime,
} from '@/utils/dateUtils';
import { toZonedTime } from 'date-fns-tz';

interface Premise {
  lat: number;
  lng: number;
  radius: number;
  name: string;
}

const PREMISES: Premise[] = [
  { lat: 13.50821, lng: 100.76405, radius: 100, name: 'บริษัท นันตา ฟู้ด' },
  { lat: 13.51444, lng: 100.70922, radius: 100, name: 'บริษัท ปัตตานี ฟู้ด' },
  {
    lat: 13.747920392683099,
    lng: 100.63441771348242,
    radius: 100,
    name: 'สำนักงานใหญ่',
  },
];

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
    const effectiveDate = startOfDay(toBangkokTime(date));
    console.log(
      `Getting effective shift for date: ${formatDateTime(effectiveDate, 'yyyy-MM-dd')}`,
    );

    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      select: { shiftCode: true },
    });

    if (!user || !user.shiftCode) {
      return null;
    }

    const regularShift = await this.getShiftByCode(user.shiftCode);

    const shiftAdjustment = await this.prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(effectiveDate),
          lt: endOfDay(effectiveDate),
        },
        status: 'approved',
      },
      include: { requestedShift: true },
    });

    if (shiftAdjustment && shiftAdjustment.requestedShift) {
      console.log('Using adjusted shift:', shiftAdjustment.requestedShift);
      return this.convertToShiftData(shiftAdjustment.requestedShift);
    }

    if (regularShift) {
      console.log('Using regular shift:', regularShift);
      return this.convertToShiftData(regularShift);
    }

    return null;
  }

  public async getShiftByCode(shiftCode: string): Promise<Shift | null> {
    return this.prisma.shift.findUnique({
      where: { shiftCode },
    });
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

  public async getAddressFromCoordinates(
    lat: number,
    lng: number,
  ): Promise<string> {
    const premise = this.isWithinPremises(lat, lng);
    if (premise) {
      return premise.name;
    }
    try {
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}`,
      );
      if (response.data.results && response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      } else {
        throw new Error('No address found');
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      const nearestPremise = this.isWithinPremises(lat, lng);
      return nearestPremise ? nearestPremise.name : 'Unknown location';
    }
  }

  public isWithinPremises(lat: number, lng: number): Premise | null {
    for (const premise of PREMISES) {
      const distance = this.calculateDistance(
        lat,
        lng,
        premise.lat,
        premise.lng,
      );
      if (distance <= premise.radius) {
        return premise;
      }
    }
    return null;
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  public async getShiftStatus(employeeId: string): Promise<{
    isOutsideShift: boolean;
    isLate: boolean;
    isOvertime: boolean;
    effectiveShift: ShiftData | null;
  }> {
    const now = getCurrentTime();
    console.log(`Current time: ${formatDateTime(now, 'yyyy-MM-dd HH:mm:ss')}`);

    const effectiveShift = await this.getEffectiveShift(employeeId, now);

    if (!effectiveShift) {
      return {
        isOutsideShift: true,
        isLate: false,
        isOvertime: false,
        effectiveShift: null,
      };
    }

    let shiftStart = this.parseShiftTime(effectiveShift.startTime, now);
    let shiftEnd = this.parseShiftTime(effectiveShift.endTime, now);

    // Handle overnight shifts
    if (isBefore(shiftEnd, shiftStart)) {
      shiftEnd = addDays(shiftEnd, 1);
    }

    console.log(
      `Shift start: ${formatDateTime(shiftStart, 'yyyy-MM-dd HH:mm:ss')}`,
    );
    console.log(
      `Shift end: ${formatDateTime(shiftEnd, 'yyyy-MM-dd HH:mm:ss')}`,
    );

    const lateThreshold = addDays(shiftStart, 30); // 30 minutes grace period
    const overtimeThreshold = addDays(shiftEnd, 5); // 5 minutes after shift end

    const isOutsideShift = isBefore(now, shiftStart) || isAfter(now, shiftEnd);
    const isLate = isAfter(now, lateThreshold) && isBefore(now, shiftEnd);
    const isOvertime = isAfter(now, overtimeThreshold);

    return {
      isOutsideShift,
      isLate,
      isOvertime,
      effectiveShift,
    };
  }

  public parseShiftTime(timeString: string, referenceDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    return setMinutes(setHours(new Date(referenceDate), hours), minutes);
  }
}

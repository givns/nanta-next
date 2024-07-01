import { PrismaClient, Attendance, Prisma, User } from '@prisma/client';
import { query } from './ExternalDbService';
import { CheckInData, CheckOutData, Location } from '../types/user';

const prisma = new PrismaClient();

export class AttendanceService {
  private locationToJsonValue(location: Location): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(location));
  }

  async checkIn(data: CheckInData): Promise<Attendance> {
    const { latestAttendance, latestExternal } =
      await this.getLatestAttendanceData(data.userId);

    if (latestAttendance && !latestAttendance.checkOutTime) {
      throw new Error('Already checked in (Internal)');
    }

    if (latestExternal && latestExternal.fx === 0) {
      throw new Error('Already checked in (External Device)');
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId: data.userId,
        checkInTime: new Date(),
        checkInLocation: this.locationToJsonValue(data.location),
        checkInAddress: data.address,
        checkInReason: data.reason,
        checkInPhoto: data.photo,
        checkInDeviceSerial: data.deviceSerial,
        source: 'Nanta-Next',
      },
    });

    await query(
      'INSERT INTO kt_jl (user_serial, sj, dev_serial, fx) VALUES (?, ?, ?, ?)',
      [
        data.userId,
        attendance.checkInTime.toISOString(),
        data.deviceSerial || '0010000',
        0,
      ],
    );

    return attendance;
  }

  async checkOut(
    data: CheckOutData,
  ): Promise<{ attendance: Attendance; user: User }> {
    const attendance = await prisma.attendance.update({
      where: { id: data.attendanceId },
      data: {
        checkOutTime: new Date(),
        checkOutLocation: this.locationToJsonValue(data.location),
        checkOutAddress: data.address,
        checkOutReason: data.reason,
        checkOutPhoto: data.photo,
        checkOutDeviceSerial: data.deviceSerial,
      },
    });

    await query(
      'UPDATE kt_jl SET fx = 1, sj = ? WHERE user_serial = ? AND fx = 0',
      [attendance.checkOutTime!.toISOString(), attendance.userId],
    );

    const user = await prisma.user.findUnique({
      where: { id: attendance.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return { attendance, user };
  }

  async getLatestAttendanceData(userId: string): Promise<{
    latestAttendance: Attendance | null;
    latestExternal: { sj: string; fx: number; bh: string } | null;
    user: User | null;
  }> {
    const [latestAttendance, [latestExternal], user] = await Promise.all([
      prisma.attendance.findFirst({
        where: { userId },
        orderBy: { checkInTime: 'desc' },
      }),
      query<{ sj: string; fx: number; bh: string }>(
        'SELECT * FROM kt_jl WHERE user_serial = ? ORDER BY sj DESC LIMIT 1',
        [userId],
      ),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);

    return { latestAttendance, latestExternal, user };
  }

  private async createOrUpdateFromExternal(
    userId: string,
    externalData: { sj: string; fx: number; bh: string },
  ): Promise<Attendance> {
    const existingRecord = await prisma.attendance.findFirst({
      where: { externalCheckId: externalData.bh },
    });

    if (existingRecord) {
      return await prisma.attendance.update({
        where: { id: existingRecord.id },
        data: {
          checkOutTime:
            externalData.fx === 1 ? new Date(externalData.sj) : null,
        },
      });
    }

    return await prisma.attendance.create({
      data: {
        userId,
        checkInTime: new Date(externalData.sj),
        checkOutTime: externalData.fx === 1 ? new Date(externalData.sj) : null,
        source: 'external',
        externalCheckId: externalData.bh,
        checkInLocation: {}, // You might want to fetch this from somewhere
        checkInAddress: 'External check-in', // You might want to fetch this from somewhere
        checkInPhoto: '', // You might want to handle this differently for external check-ins
      },
    });
  }

  async consolidateAttendance() {
    const externalRecords = await query<{
      user_serial: string;
      sj: string;
      fx: number;
      bh: string;
    }>(
      'SELECT * FROM kt_jl WHERE sj > ?',
      [new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()], // Last 30 days
    );

    for (const record of externalRecords) {
      await this.createOrUpdateFromExternal(record.user_serial, record);
    }
  }
}

export const attendanceService = new AttendanceService();

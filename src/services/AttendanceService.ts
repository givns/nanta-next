// services/AttendanceService.ts

import { PrismaClient, Attendance } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import {
  AttendanceStatus,
  ExternalCheckInData,
  AttendanceData,
} from '../types/user';

const prisma = new PrismaClient();
const externalDb = new ExternalDbService();

export class AttendanceService {
  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatus> {
    const user = await prisma.user.findUnique({ where: { employeeId } });
    if (!user) throw new Error('User not found');

    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId: user.id },
      orderBy: { checkInTime: 'desc' },
    });

    const externalCheckIn = await externalDb.getLatestCheckIn(employeeId);

    let consolidatedAttendance = latestAttendance;
    let isCheckingIn = true;

    if (externalCheckIn) {
      const externalCheckInTime = new Date(externalCheckIn.sj);
      if (
        !latestAttendance ||
        externalCheckInTime > latestAttendance.checkInTime
      ) {
        // External check-in is more recent, create or update attendance record
        consolidatedAttendance =
          await this.createOrUpdateAttendanceFromExternalData(
            user.id,
            externalCheckIn,
          );
      }
    }

    if (consolidatedAttendance) {
      isCheckingIn = !consolidatedAttendance.checkOutTime;
    }

    return {
      user: {
        id: user.id,
        lineUserId: user.lineUserId,
        name: user.name,
        nickname: user.nickname,
        department: user.department,
        employeeId: user.employeeId,
        role: user.role,
        profilePictureUrl: user.profilePictureUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      latestAttendance: consolidatedAttendance,
      isCheckingIn,
    };
  }

  private async createOrUpdateAttendanceFromExternalData(
    userId: string,
    externalData: ExternalCheckInData,
  ): Promise<Attendance> {
    const isCheckOut = externalData.fx !== 0;
    const checkTime = new Date(externalData.sj);

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        checkInTime: {
          gte: new Date(
            checkTime.getFullYear(),
            checkTime.getMonth(),
            checkTime.getDate(),
          ),
          lt: new Date(
            checkTime.getFullYear(),
            checkTime.getMonth(),
            checkTime.getDate() + 1,
          ),
        },
      },
    });

    if (existingAttendance) {
      return prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          checkOutTime: isCheckOut ? checkTime : undefined,
          checkOutDeviceSerial: isCheckOut
            ? externalData.dev_serial
            : undefined,
          status: isCheckOut ? 'checked-out' : 'checked-in',
        },
      });
    } else {
      return prisma.attendance.create({
        data: {
          userId,
          checkInTime: checkTime,
          checkOutTime: isCheckOut ? checkTime : null,
          checkInDeviceSerial: externalData.dev_serial,
          checkOutDeviceSerial: isCheckOut ? externalData.dev_serial : null,
          status: isCheckOut ? 'checked-out' : 'checked-in',
          isManualEntry: false,
          checkInLocation: JSON.stringify({ lat: 0, lng: 0 }),
          checkOutLocation: isCheckOut
            ? JSON.stringify({ lat: 0, lng: 0 })
            : null,
          checkInAddress: 'N/A',
          checkOutAddress: isCheckOut ? 'N/A' : null,
          checkOutReason: isCheckOut ? 'External check-out' : null,
          checkInPhoto: 'N/A',
          checkOutPhoto: isCheckOut ? 'N/A' : null,
        },
      });
    }
  }

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    const checkTime = new Date(data.checkTime);
    if (isNaN(checkTime.getTime())) {
      throw new Error('Invalid checkTime provided');
    }

    const user = await prisma.user.findUnique({
      where: { id: data.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check for existing attendance record
    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId: user.id },
      orderBy: { checkInTime: 'desc' },
    });

    if (latestAttendance && !latestAttendance.checkOutTime) {
      // User is checking out
      return this.processCheckOut(latestAttendance.id, data);
    } else {
      // User is checking in
      return this.processCheckIn(data);
    }
  }
  private async processCheckIn(data: AttendanceData): Promise<Attendance> {
    return prisma.attendance.create({
      data: {
        userId: data.userId,
        checkInTime: new Date(data.checkTime),
        checkInLocation: JSON.stringify(data.location),
        checkInAddress: data.address,
        checkInReason: data.reason || '',
        checkInPhoto: data.photo || '',
        checkInDeviceSerial: data.deviceSerial,
        status: 'checked-in',
        isManualEntry: false,
      },
    });
  }

  private async processCheckOut(
    attendanceId: string,
    data: AttendanceData,
  ): Promise<Attendance> {
    return prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkOutTime: new Date(data.checkTime),
        checkOutLocation: JSON.stringify(data.location),
        checkOutAddress: data.address,
        checkOutReason: data.reason || null,
        checkOutPhoto: data.photo || null,
        checkOutDeviceSerial: data.deviceSerial,
        status: 'checked-out',
      },
    });
  }

  private async createAttendanceFromExternalData(
    userId: string,
    externalData: ExternalCheckInData,
  ): Promise<Attendance> {
    const isCheckOut = externalData.fx !== 0;
    const checkInTime = new Date(externalData.sj);

    if (isNaN(checkInTime.getTime())) {
      throw new Error('Invalid date in external data');
    }
    const attendanceData = {
      userId: userId,
      checkInTime: new Date(externalData.sj),
      checkOutTime: isCheckOut ? new Date(externalData.sj) : null,
      checkInDeviceSerial: externalData.dev_serial,
      checkOutDeviceSerial: isCheckOut ? externalData.dev_serial : null,
      status: isCheckOut ? 'checked-out' : 'checked-in',
      isManualEntry: false,
      checkInLocation: JSON.stringify({ lat: 0, lng: 0 }),
      checkOutLocation: isCheckOut ? JSON.stringify({ lat: 0, lng: 0 }) : null,
      checkInAddress: 'N/A',
      checkOutAddress: isCheckOut ? 'N/A' : null,
      checkInReason: 'External check-in',
      checkOutReason: isCheckOut ? 'External check-out' : null,
      checkInPhoto: 'N/A',
      checkOutPhoto: isCheckOut ? 'N/A' : null,
    };

    return prisma.attendance.create({ data: attendanceData });
  }

  async getAttendanceHistory(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    return prisma.attendance.findMany({
      where: {
        userId,
        checkInTime: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        checkInTime: 'desc',
      },
    });
  }

  async calculateWorkHours(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const attendances = await this.getAttendanceHistory(
      userId,
      startDate,
      endDate,
    );

    let totalHours = 0;
    for (const attendance of attendances) {
      if (attendance.checkOutTime) {
        const duration =
          attendance.checkOutTime.getTime() - attendance.checkInTime.getTime();
        totalHours += duration / (1000 * 60 * 60); // Convert milliseconds to hours
      }
    }

    return totalHours;
  }
}

// services/AttendanceService.ts

import { PrismaClient, Attendance } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { UserData, AttendanceStatus, ExternalCheckInData } from '../types/user';

const prisma = new PrismaClient();
const externalDb = new ExternalDbService();

export class AttendanceService {
  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatus> {
    const user = await prisma.user.findUnique({
      where: { employeeId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const userData: UserData = {
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
    };

    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId: user.id },
      orderBy: { checkInTime: 'desc' },
    });

    const externalCheckIn = await externalDb.getLatestCheckIn(employeeId);

    let isCheckingIn = true;
    let mostRecentRecord: Attendance | null = null;

    if (latestAttendance && externalCheckIn) {
      const latestAttendanceTime = new Date(latestAttendance.checkInTime);
      const externalCheckInTime = new Date(externalCheckIn.sj);

      if (latestAttendanceTime > externalCheckInTime) {
        mostRecentRecord = latestAttendance;
        isCheckingIn = !latestAttendance.checkOutTime;
      } else {
        mostRecentRecord = await this.createAttendanceFromExternalData(
          user.id,
          externalCheckIn,
        );
        isCheckingIn = externalCheckIn.fx !== 0;
      }
    } else if (latestAttendance) {
      mostRecentRecord = latestAttendance;
      isCheckingIn = !latestAttendance.checkOutTime;
    } else if (externalCheckIn) {
      mostRecentRecord = await this.createAttendanceFromExternalData(
        user.id,
        externalCheckIn,
      );
      isCheckingIn = externalCheckIn.fx !== 0;
    }

    return {
      user: userData,
      latestAttendance: mostRecentRecord,
      isCheckingIn,
    };
  }

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

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
    const attendance = await prisma.attendance.create({
      data: {
        userId: data.userId,
        checkInTime: data.checkTime,
        checkInLocation: JSON.stringify(data.location),
        checkInAddress: data.address,
        checkInReason: data.reason || '',
        checkInPhoto: data.photo || '',
        checkInDeviceSerial: data.deviceSerial,
        status: 'checked-in',
        isManualEntry: false,
      },
    });

    await externalDb.createCheckIn({
      employeeId: data.employeeId,
      timestamp: data.checkTime,
      checkType: 0, // 0 for check-in
      deviceSerial: data.deviceSerial,
    });

    return attendance;
  }

  private async processCheckOut(
    attendanceId: string,
    data: AttendanceData,
  ): Promise<Attendance> {
    const updatedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkOutTime: data.checkTime,
        checkOutLocation: JSON.stringify(data.location),
        checkOutAddress: data.address,
        checkOutReason: data.reason || null,
        checkOutPhoto: data.photo || null,
        checkOutDeviceSerial: data.deviceSerial,
        status: 'checked-out',
      },
    });

    await externalDb.updateCheckOut({
      employeeId: data.employeeId,
      timestamp: data.checkTime,
      checkType: 1, // 1 for check-out
      deviceSerial: data.deviceSerial,
    });

    return updatedAttendance;
  }

  private async createAttendanceFromExternalData(
    userId: string,
    externalData: ExternalCheckInData,
  ): Promise<Attendance> {
    const isCheckOut = externalData.fx !== 0;

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

interface AttendanceData {
  userId: string;
  employeeId: string;
  checkTime: Date;
  location: { lat: number; lng: number };
  address: string;
  reason?: string;
  photo?: string;
  deviceSerial: string;
}

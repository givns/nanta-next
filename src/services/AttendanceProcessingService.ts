// AttendanceProcessingService.ts

import { PrismaClient, Attendance, User, Shift } from '@prisma/client';
import { NotificationService } from './NotificationService';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { ApprovedOvertime } from '../types/user';

const prisma = new PrismaClient();
const overtimeService = new OvertimeServiceServer();
const notificationService = new NotificationService();

export class AttendanceProcessingService {
  async processCheckIn(
    userId: string,
    checkInTime: Date,
    attendanceType:
      | 'regular'
      | 'flexible-start'
      | 'flexible-end'
      | 'grace-period'
      | 'overtime',
    additionalData: {
      location: string;
      address: string;
      reason?: string;
      photo?: string;
      deviceSerial: string;
    },
  ): Promise<Attendance> {
    const user = await this.getUserWithShift(userId);
    if (!user) throw new Error('User not found');

    const { shift, shiftStart, shiftEnd } = await this.getEffectiveShift(
      user,
      checkInTime,
    );
    console.log(`Shift: ${shift.name}`);

    let status: string;
    let isOvertime = false;
    switch (attendanceType) {
      case 'overtime':
        status = 'overtime-started';
        isOvertime = true;
        break;
      case 'flexible-start':
        status = 'flexible-start';
        break;
      case 'flexible-end':
        status = 'flexible-end';
        break;
      case 'grace-period':
        status = 'grace-period';
        break;
      default:
        status = 'checked-in';
    }

    if (attendanceType === 'regular' && checkInTime < shiftStart) {
      const overtimeRequest = await this.getApprovedOvertimeRequest(
        userId,
        checkInTime,
      );
      if (!overtimeRequest) {
        await notificationService.sendNotification(
          userId,
          'Early check-in detected. Please try again at your shift start time.',
        );
        throw new Error('Early check-in not allowed');
      }
      isOvertime = true;
    }

    const attendance = await prisma.attendance.create({
      data: {
        userId,
        date: new Date(
          checkInTime.getFullYear(),
          checkInTime.getMonth(),
          checkInTime.getDate(),
        ),
        checkInTime,
        status,
        checkInLocation: additionalData.location,
        checkInAddress: additionalData.address,
        checkInReason: additionalData.reason || null,
        checkInPhoto: additionalData.photo || null,
        checkInDeviceSerial: additionalData.deviceSerial,
        isOvertime,
      },
    });

    await notificationService.sendNotification(
      userId,
      `Check-in recorded at ${checkInTime.toLocaleTimeString()} (${status})`,
    );

    return attendance;
  }

  async processCheckOut(
    userId: string,
    checkOutTime: Date,
    attendanceType:
      | 'regular'
      | 'flexible-start'
      | 'flexible-end'
      | 'grace-period'
      | 'overtime',
    additionalData: {
      location: string;
      address: string;
      reason?: string;
      photo?: string;
      deviceSerial: string;
    },
  ): Promise<Attendance> {
    const user = await this.getUserWithShift(userId);
    if (!user) throw new Error('User not found');

    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId, checkOutTime: null },
      orderBy: { checkInTime: 'desc' },
    });

    if (!latestAttendance) {
      throw new Error('No active check-in found');
    }

    const { shift, shiftStart, shiftEnd } = await this.getEffectiveShift(
      user,
      checkOutTime,
    );
    console.log(shift);

    let status: string;
    let isOvertime = latestAttendance.isOvertime;
    switch (attendanceType) {
      case 'overtime':
        status = 'overtime-ended';
        isOvertime = true;
        break;
      case 'flexible-start':
        status = 'flexible-start-ended';
        break;
      case 'flexible-end':
        status = 'flexible-end-ended';
        break;
      case 'grace-period':
        status = 'grace-period-ended';
        break;
      default:
        status = 'checked-out';
    }

    if (attendanceType === 'regular' && checkOutTime > shiftEnd) {
      const overtimeRequest = await this.getApprovedOvertimeRequest(
        userId,
        checkOutTime,
      );
      if (!overtimeRequest) {
        await notificationService.sendNotification(
          userId,
          'Late check-out detected. Please submit an overtime request if needed.',
        );
      } else {
        isOvertime = true;
      }
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: latestAttendance.id },
      data: {
        checkOutTime,
        status,
        checkOutLocation: additionalData.location,
        checkOutAddress: additionalData.address,
        checkOutReason: additionalData.reason || null,
        checkOutPhoto: additionalData.photo || null,
        checkOutDeviceSerial: additionalData.deviceSerial,
        isOvertime,
      },
    });

    await notificationService.sendNotification(
      userId,
      `Check-out recorded at ${checkOutTime.toLocaleTimeString()} (${status})`,
    );

    return updatedAttendance;
  }

  private async getUserWithShift(
    userId: string,
  ): Promise<User & { assignedShift: Shift }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user) throw new Error('User not found');
    return user;
  }

  private async getEffectiveShift(
    user: User & { assignedShift: Shift },
    date: Date,
  ): Promise<{ shift: Shift; shiftStart: Date; shiftEnd: Date }> {
    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId: user.id,
        date: {
          equals: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        },
        status: 'approved',
      },
      include: { requestedShift: true },
    });

    const effectiveShift = shiftAdjustment
      ? shiftAdjustment.requestedShift
      : user.assignedShift;
    const [startHour, startMinute] = effectiveShift.startTime
      .split(':')
      .map(Number);
    const [endHour, endMinute] = effectiveShift.endTime.split(':').map(Number);

    const shiftStart = new Date(date);
    shiftStart.setHours(startHour, startMinute, 0, 0);

    const shiftEnd = new Date(date);
    shiftEnd.setHours(endHour, endMinute, 0, 0);

    // Handle overnight shifts
    if (shiftEnd <= shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    return { shift: effectiveShift, shiftStart, shiftEnd };
  }

  private async getApprovedOvertimeRequest(
    userId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    return overtimeService.getApprovedOvertimeRequest(userId, date);
  }
}

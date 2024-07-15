// services/AttendanceProcessingService.ts
import { PrismaClient, Attendance, User, Shift } from '@prisma/client';
import { NotificationService } from './NotificationService';
import { OvertimeServiceServer } from './OvertimeServiceServer';

const prisma = new PrismaClient();
const overtimeService = new OvertimeServiceServer();
const notificationService = new NotificationService();

export class AttendanceProcessingService {
  async processCheckIn(
    userId: string,
    checkInTime: Date,
    isOvertime: boolean,
  ): Promise<Attendance> {
    const user = await this.getUserWithShift(userId);
    if (!user) throw new Error('User not found');

    const { shift, shiftStart } = await this.getEffectiveShift(
      user,
      checkInTime,
    );
    console.log(`Shift: ${shift.name}`);

    if (!isOvertime && checkInTime < shiftStart) {
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
        status: isOvertime ? 'overtime-started' : 'checked-in',
        checkInLocation: '',
        checkInPhoto: 'path/to/photo.jpg',
      },
    });

    await notificationService.sendNotification(
      userId,
      `Check-in recorded at ${checkInTime.toLocaleTimeString()}`,
    );

    return attendance;
  }

  async processCheckOut(
    userId: string,
    checkOutTime: Date,
    isOvertime: boolean,
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

    const { shift, shiftEnd } = await this.getEffectiveShift(
      user,
      checkOutTime,
    );
    console.log(shift);

    if (!isOvertime && checkOutTime > shiftEnd) {
      const overtimeRequest = await this.getApprovedOvertimeRequest(
        userId,
        checkOutTime,
      );
      if (!overtimeRequest) {
        await notificationService.sendNotification(
          userId,
          'Late check-out detected. Please submit an overtime request if needed.',
        );
      }
    }

    const updatedAttendance = await prisma.attendance.update({
      where: { id: latestAttendance.id },
      data: {
        checkOutTime,
        status: isOvertime ? 'overtime-ended' : 'checked-out',
      },
    });

    await notificationService.sendNotification(
      userId,
      `Check-out recorded at ${checkOutTime.toLocaleTimeString()}`,
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

    return { shift: effectiveShift, shiftStart, shiftEnd };
  }

  private async getApprovedOvertimeRequest(
    userId: string,
    date: Date,
  ): Promise<boolean> {
    const overtimeRequest = await overtimeService.getApprovedOvertimeRequest(
      userId,
      date,
    );
    return !!overtimeRequest;
  }
}

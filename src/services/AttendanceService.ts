import { PrismaClient, Attendance } from '@prisma/client';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { ExternalDbService } from './ExternalDbService';
import { NotificationService } from './NotificationService';
import {
  CheckType,
  ExternalCheckInData,
  AttendanceData,
  AttendanceStatus,
} from '../types/user';

const prisma = new PrismaClient();
const processingService = new AttendanceProcessingService();
const externalDbService = new ExternalDbService();
const notificationService = new NotificationService();

export class AttendanceService {
  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatus> {
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });
    if (!user) throw new Error('User not found');

    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId: user.id },
      orderBy: { checkInTime: 'desc' },
    });

    const externalCheckIn =
      await externalDbService.getLatestCheckIn(employeeId);

    let consolidatedAttendance = latestAttendance;
    let isCheckingIn = true;

    if (externalCheckIn) {
      const externalCheckInTime = new Date(externalCheckIn.sj);
      if (
        !latestAttendance ||
        externalCheckInTime > new Date(latestAttendance.checkInTime)
      ) {
        consolidatedAttendance =
          await this.processExternalCheckInOut(externalCheckIn);
      }
    }

    if (consolidatedAttendance) {
      isCheckingIn = !consolidatedAttendance.checkOutTime;
    }

    return {
      user: {
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        assignedShift: user.assignedShift,
      },
      latestAttendance: consolidatedAttendance,
      isCheckingIn,
    };
  }

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new Error('User not found');

    const checkTime = new Date(data.checkTime);

    try {
      if (data.isCheckIn) {
        if (typeof data.isOvertime === 'boolean') {
          return await processingService.processCheckIn(
            user.id,
            checkTime,
            data.isOvertime,
          );
        } else {
          // Handle the case when isOvertime is undefined
          // You can throw an error, use a default value, or handle it in a different way
          throw new Error('isOvertime is undefined');
        }
      } else {
        if (typeof data.isOvertime === 'boolean') {
          return await processingService.processCheckOut(
            user.id,
            checkTime,
            data.isOvertime,
          );
        } else {
          // Handle the case when isOvertime is undefined
          // You can throw an error, use a default value, or handle it in a different way
          throw new Error('isOvertime is undefined');
        }
      }
    } catch (error: any) {
      console.error('Error processing attendance:', error);
      await notificationService.sendNotification(
        user.id,
        `Error processing ${data.isCheckIn ? 'check-in' : 'check-out'}: ${error.message}`,
      );
      throw error;
    }
  }

  async processExternalCheckInOut(
    externalData: ExternalCheckInData,
  ): Promise<Attendance> {
    const user = await prisma.user.findUnique({
      where: { employeeId: externalData.user_no },
    });
    if (!user) throw new Error('User not found');

    const checkTime = new Date(externalData.sj);

    try {
      switch (externalData.fx) {
        case CheckType.Auto: {
          const latestAttendance = await prisma.attendance.findFirst({
            where: { userId: user.id },
            orderBy: { checkInTime: 'desc' },
          });
          if (!latestAttendance || latestAttendance.checkOutTime) {
            return await processingService.processCheckIn(
              user.id,
              checkTime,
              false,
            );
          } else {
            return await processingService.processCheckOut(
              user.id,
              checkTime,
              false,
            );
          }
        }
        case CheckType.CheckIn:
          return await processingService.processCheckIn(
            user.id,
            checkTime,
            false,
          );
        case CheckType.CheckOut:
          return await processingService.processCheckOut(
            user.id,
            checkTime,
            false,
          );
        case CheckType.OvertimeStart:
          return await processingService.processCheckIn(
            user.id,
            checkTime,
            true,
          );
        case CheckType.OvertimeEnd:
          return await processingService.processCheckOut(
            user.id,
            checkTime,
            true,
          );
        default:
          throw new Error('Invalid check type');
      }
    } catch (error: any) {
      console.error('Error processing external check-in/out:', error);
      await notificationService.sendNotification(
        user.id,
        `Error processing attendance: ${error.message}`,
      );
      throw error;
    }
  }

  async getAttendanceHistory(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    return prisma.attendance.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: {
        date: 'asc',
        checkInTime: 'asc',
      },
    });
  }

  async requestManualEntry(
    userId: string,
    date: Date,
    checkInTime: Date,
    checkOutTime: Date,
    reason: string,
  ): Promise<Attendance> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const manualEntry = await prisma.attendance.create({
      data: {
        userId,
        date,
        checkInTime,
        checkOutTime,
        status: 'manual-entry',
        isManualEntry: true,
        checkInReason: reason,
        checkOutReason: reason,
        checkInLocation: 'YourCheckInLocationValue',
        checkInPhoto: 'YourCheckInPhotoValue',
      },
    });

    await notificationService.sendNotification(
      user.id,
      `Manual entry created for ${date.toDateString()}. Please contact admin for approval.`,
    );

    return manualEntry;
  }

  async approveManualEntry(
    attendanceId: string,
    adminId: string,
  ): Promise<Attendance> {
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    });
    if (!attendance) throw new Error('Attendance record not found');

    if (!attendance.isManualEntry) {
      throw new Error('This is not a manual entry');
    }

    const approvedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: 'approved',
        checkOutReason: `Approved by admin ${adminId}`,
      },
    });

    await notificationService.sendNotification(
      attendance.userId,
      `Your manual entry for ${attendance.date.toDateString()} has been approved.`,
    );

    return approvedAttendance;
  }
}

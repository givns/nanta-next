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
import { isWithinAllowedTimeRange } from '../utils/timeUtils'; // Import from utilities

const prisma = new PrismaClient();
const processingService = new AttendanceProcessingService();
const notificationService = new NotificationService();

export class AttendanceService {
  private externalDbService: ExternalDbService;

  constructor() {
    this.externalDbService = new ExternalDbService();
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatus> {
    if (!employeeId) {
      throw new Error('Employee ID is required');
    }

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });

    if (!user) throw new Error('User not found');

    let latestAttendance = await prisma.attendance.findFirst({
      where: { userId: user.id },
      orderBy: { checkInTime: 'desc' },
    });

    const currentShift = user.assignedShift;
    if (!currentShift) throw new Error('User has no assigned shift');

    let externalUser: ExternalCheckInData | null = null;
    try {
      externalUser = await this.externalDbService.getLatestCheckIn(employeeId, {
        startTime: currentShift.startTime,
        endTime: currentShift.endTime,
      });
    } catch (error) {
      console.error('Error fetching external user data:', error);
    }

    let isCheckingIn = true;

    if (externalUser) {
      try {
        const externalCheckInTime = new Date(externalUser.sj);
        if (
          !latestAttendance ||
          externalCheckInTime > new Date(latestAttendance.checkInTime)
        ) {
          latestAttendance = await this.processExternalCheckInOut(externalUser);
        }

        if (externalUser.dev_serial === '0010012') {
          console.log('Regular check-in detected');
        } else if (externalUser.dev_serial === '0010000') {
          console.log('Fallback check-in detected');
        }

        // Using the imported isWithinAllowedTimeRange function
        const shiftStart = new Date(externalCheckInTime);
        shiftStart.setHours(
          parseInt(currentShift.startTime.split(':')[0]),
          parseInt(currentShift.startTime.split(':')[1]),
          0,
          0,
        );
        const shiftEnd = new Date(externalCheckInTime);
        shiftEnd.setHours(
          parseInt(currentShift.endTime.split(':')[0]),
          parseInt(currentShift.endTime.split(':')[1]),
          0,
          0,
        );

        if (
          !isWithinAllowedTimeRange(externalCheckInTime, shiftStart, shiftEnd)
        ) {
          console.log('Check-in time is outside the allowed range');
          // Handle this case as needed
        }
      } catch (error) {
        console.error('Error processing external check-in data:', error);
      }
    }

    if (latestAttendance) {
      isCheckingIn = !latestAttendance.checkOutTime;
    }

    return {
      user: {
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        assignedShift: user.assignedShift,
      },
      latestAttendance,
      isCheckingIn,
      shiftAdjustment: null,
    };
  }
  async getUserCheckInHistory(employeeId: string): Promise<any[]> {
    return this.externalDbService.getUserCheckInData(employeeId);
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
      where: { employeeId: externalData.user_serial.toString() },
    });
    if (!user) throw new Error('User not found');

    const checkTime = new Date(externalData.sj);

    console.log(`Processing external check type: ${externalData.fx}`);

    let checkType: CheckType = externalData.fx as CheckType;
    let isOvertime: boolean = false;

    switch (checkType) {
      case CheckType.Auto:
        checkType = await this.determineAutoCheckType(user.id, checkTime);
        break;
      case CheckType.OvertimeStart:
        checkType = CheckType.CheckIn;
        isOvertime = true;
        break;
      case CheckType.OvertimeEnd:
        checkType = CheckType.CheckOut;
        isOvertime = true;
        break;
      case CheckType.BackToWork:
        checkType = CheckType.CheckIn;
        break;
      case CheckType.LeaveDuringWork:
        checkType = CheckType.CheckOut;
        break;
    }

    if (checkType === CheckType.CheckIn) {
      return await this.createAttendance(user.id, checkTime, isOvertime);
    } else if (checkType === CheckType.CheckOut) {
      return await this.updateAttendance(user.id, checkTime, isOvertime);
    } else {
      throw new Error(`Unhandled check type: ${checkType}`);
    }
  }

  private async determineAutoCheckType(
    userId: string,
    checkTime: Date,
  ): Promise<CheckType> {
    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId },
      orderBy: { checkInTime: 'desc' },
    });

    if (!latestAttendance || latestAttendance.checkOutTime) {
      return CheckType.CheckIn;
    } else {
      return CheckType.CheckOut;
    }
  }

  private async createAttendance(
    userId: string,
    checkTime: Date,
    isOvertime: boolean,
  ): Promise<Attendance> {
    return prisma.attendance.create({
      data: {
        userId,
        date: new Date(
          checkTime.getFullYear(),
          checkTime.getMonth(),
          checkTime.getDate(),
        ),
        checkInTime: checkTime,
        status: isOvertime ? 'overtime-started' : 'checked-in',
        checkInLocation: JSON.stringify({ lat: 0, lng: 0 }), // You should replace this with actual location data
        checkInPhoto: 'N/A', // Replace with actual photo data or path if available
        checkInAddress: 'N/A', // Replace with actual address if available
        checkInDeviceSerial: 'EXTERNAL', // Or any identifier for your external system
        isManualEntry: false,
      },
    });
  }

  private async updateAttendance(
    userId: string,
    checkTime: Date,
    isOvertime: boolean,
  ): Promise<Attendance> {
    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId, checkOutTime: null },
      orderBy: { checkInTime: 'desc' },
    });

    if (!latestAttendance) {
      throw new Error('No open attendance record found for check-out');
    }

    return prisma.attendance.update({
      where: { id: latestAttendance.id },
      data: {
        checkOutTime: checkTime,
        status: isOvertime ? 'overtime-ended' : 'checked-out',
        checkOutLocation: JSON.stringify({ lat: 0, lng: 0 }), // Replace with actual location data
        checkOutPhoto: 'N/A', // Replace with actual photo data or path if available
        checkOutAddress: 'N/A', // Replace with actual address if available
        checkOutDeviceSerial: 'EXTERNAL', // Or any identifier for your external system
      },
    });
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

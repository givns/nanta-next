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
import { formatDate } from '../utils/dateUtils';

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
    console.log(
      `Getting latest attendance status for employee ID: ${employeeId}`,
    );

    if (!employeeId) {
      console.error('Employee ID is required');
      throw new Error('Employee ID is required');
    }

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });

    if (!user) {
      console.error(`User not found for employee ID: ${employeeId}`);
      throw new Error('User not found');
    }

    if (!user.assignedShift) {
      console.error(`User has no assigned shift: ${employeeId}`);
      throw new Error('User has no assigned shift');
    }

    console.log(
      `User found: ${user.id}, Assigned shift: ${user.assignedShift.id}`,
    );

    let externalData: {
      checkIn: ExternalCheckInData | null;
      userInfo: any | null;
    } | null = null;

    try {
      externalData = await this.externalDbService.getLatestCheckIn(employeeId);
      console.log('External data:', JSON.stringify(externalData, null, 2));
    } catch (error) {
      console.error('Error fetching external user data:', error);
    }

    const checkType = await this.determineAutoCheckType(user.id);
    let latestAttendance = null;

    if (externalData?.checkIn) {
      try {
        latestAttendance = await this.processExternalCheckInOut(
          externalData.checkIn,
          externalData.userInfo,
          user.assignedShift,
        );
        console.log(
          `Processed attendance: ${JSON.stringify(latestAttendance)}`,
        );
      } catch (error) {
        console.error('Error processing external check-in data:', error);
      }
    } else {
      console.log(`No external check-in found for employee ID: ${employeeId}`);
    }

    const result: AttendanceStatus = {
      user: {
        id: user.id,
        employeeId: user.employeeId,
        name: user.name,
        assignedShift: user.assignedShift,
      },
      latestAttendance,
      isCheckingIn: checkType === CheckType.CheckIn,
      shiftAdjustment: null,
    };

    console.log(`Returning attendance status: ${JSON.stringify(result)}`);
    return result;
  }

  async processExternalCheckInOut(
    externalCheckIn: ExternalCheckInData,
    userInfo: any,
    shift: { startTime: string; endTime: string },
  ): Promise<Attendance> {
    console.log(
      'Processing external check-in data:',
      JSON.stringify(externalCheckIn, null, 2),
    );
    console.log('User info:', JSON.stringify(userInfo, null, 2));

    const user = await prisma.user.findUnique({
      where: { employeeId: userInfo.user_no.toString() },
    });

    if (!user) {
      console.error('User not found for employee ID:', userInfo.user_no);
      throw new Error('User not found');
    }

    const checkTime = new Date(externalCheckIn.sj);

    const startOfDay = new Date(checkTime);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(checkTime);
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        userId: user.id,
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { checkInTime: 'asc' },
    });

    console.log('Attendance records for the day:', attendanceRecords);

    const checkType = await this.determineAutoCheckType(user.id);
    const isOvertime = this.isOvertime(checkTime, shift);

    console.log(`Processing as ${checkType}, Overtime: ${isOvertime}`);

    if (checkType === CheckType.CheckIn) {
      return await this.createAttendance(user.id, checkTime, isOvertime);
    } else {
      const lastOpenRecord = attendanceRecords.find(
        (record) => !record.checkOutTime,
      );
      if (lastOpenRecord) {
        return await this.updateAttendance(
          lastOpenRecord.id,
          checkTime,
          isOvertime,
        );
      } else {
        console.warn(
          'No open attendance record found. Creating a new check-in record.',
        );
        return await this.createAttendance(user.id, checkTime, isOvertime);
      }
    }
  }

  private isOvertime(
    checkTime: Date,
    shift: { startTime: string; endTime: string },
  ): boolean {
    const shiftStart = new Date(checkTime);
    shiftStart.setHours(
      parseInt(shift.startTime.split(':')[0]),
      parseInt(shift.startTime.split(':')[1]),
      0,
      0,
    );
    const shiftEnd = new Date(checkTime);
    shiftEnd.setHours(
      parseInt(shift.endTime.split(':')[0]),
      parseInt(shift.endTime.split(':')[1]),
      0,
      0,
    );
    if (shiftEnd < shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);

    return checkTime < shiftStart || checkTime > shiftEnd;
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

  private async determineAutoCheckType(userId: string): Promise<CheckType> {
    const latestAttendance = await prisma.attendance.findFirst({
      where: { userId },
      orderBy: { checkInTime: 'desc' },
    });

    if (!latestAttendance) {
      return CheckType.CheckIn;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (latestAttendance.date < today) {
      return CheckType.CheckIn;
    }

    if (latestAttendance.checkOutTime) {
      return CheckType.CheckIn;
    }

    return CheckType.CheckOut;
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
        checkInLocation: JSON.stringify({ lat: 0, lng: 0 }),
        checkInPhoto: 'N/A',
        checkInAddress: 'N/A',
        checkInDeviceSerial: 'EXTERNAL',
        isManualEntry: false,
      },
    });
  }

  private async updateAttendance(
    attendanceId: string,
    checkOutTime: Date,
    isOvertime: boolean,
  ): Promise<Attendance> {
    return prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkOutTime,
        status: isOvertime ? 'overtime-ended' : 'checked-out',
        checkOutLocation: JSON.stringify({ lat: 0, lng: 0 }),
        checkOutPhoto: 'N/A',
        checkOutAddress: 'N/A',
        checkOutDeviceSerial: 'EXTERNAL',
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

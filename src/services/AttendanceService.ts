import { PrismaClient, Attendance } from '@prisma/client';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { ExternalDbService } from './ExternalDbService';
import { NotificationService } from './NotificationService';
import {
  ExternalCheckInData,
  AttendanceData,
  AttendanceStatus,
  AttendanceRecord,
  ShiftData,
  ShiftAdjustment,
} from '../types/user';
import { UserRole } from '@/types/enum';

const prisma = new PrismaClient();
const processingService = new AttendanceProcessingService();
const notificationService = new NotificationService();
const profilePictureExternalBaseURL = 'https://profile-pictures/';

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

    try {
      const user = await prisma.user.findUnique({
        where: { employeeId },
        include: {
          assignedShift: true,
          department: true,
          approvedOvertimes: {
            where: {
              date: {
                gte: new Date(new Date().setHours(0, 0, 0, 0)),
              },
            },
            orderBy: {
              startTime: 'desc',
            },
            take: 1,
          },
        },
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

      // Fetch both internal and external attendance data
      const [internalAttendance, externalCheckInData, externalCheckOutData] =
        await Promise.all([
          this.getInternalAttendanceRecord(user.id),
          this.externalDbService.getLatestCheckIn(employeeId),
          this.externalDbService.getLatestCheckOut(employeeId),
        ]);

      console.log(
        'External check-in data:',
        JSON.stringify(externalCheckInData, null, 2),
      );
      console.log(
        'External check-out data:',
        JSON.stringify(externalCheckOutData, null, 2),
      );

      // Determine the latest attendance record
      const latestAttendance = this.getLatestAttendanceRecord(
        internalAttendance,
        externalCheckInData?.checkIn || null,
        externalCheckOutData?.checkOut || null,
        user.assignedShift,
      );

      const isCheckingIn = this.determineIfCheckingIn(latestAttendance);
      const shiftAdjustment = await this.getLatestShiftAdjustment(user.id);

      const result: AttendanceStatus = {
        user: {
          id: user.id,
          lineUserId: user.lineUserId,
          name: user.name,
          nickname: user.nickname,
          departmentId: user.departmentId,
          department: user.department.name,
          employeeId: user.employeeId,
          role: user.role as UserRole,
          shiftId: user.shiftId,
          assignedShift: user.assignedShift
            ? {
                id: user.assignedShift.id,
                shiftCode: user.assignedShift.shiftCode,
                name: user.assignedShift.name,
                startTime: user.assignedShift.startTime,
                endTime: user.assignedShift.endTime,
                workDays: user.assignedShift.workDays,
              }
            : null,
          profilePictureUrl: user.profilePictureUrl,
          profilePictureExternal: user.profilePictureExternal,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        latestAttendance: latestAttendance
          ? {
              id: latestAttendance.id,
              userId: latestAttendance.userId,
              date: latestAttendance.date.toISOString(),
              checkInTime: latestAttendance.checkInTime?.toISOString() ?? null,
              checkOutTime:
                latestAttendance.checkOutTime?.toISOString() ?? null,
              checkInDeviceSerial: latestAttendance.checkInDeviceSerial ?? '',
              checkOutDeviceSerial:
                latestAttendance.checkOutDeviceSerial ?? null,
              status: latestAttendance.status as 'checked-in' | 'checked-out',
              isManualEntry: latestAttendance.isManualEntry,
            }
          : null,
        isCheckingIn,
        shiftAdjustment: shiftAdjustment
          ? {
              requestedShiftId: shiftAdjustment.requestedShiftId,
              requestedShift: {
                id: shiftAdjustment.requestedShift.id,
                shiftCode: shiftAdjustment.requestedShift.shiftCode,
                name: shiftAdjustment.requestedShift.name,
                startTime: shiftAdjustment.requestedShift.startTime,
                endTime: shiftAdjustment.requestedShift.endTime,
                workDays: shiftAdjustment.requestedShift.workDays,
              },
            }
          : null,
        approvedOvertime: user.approvedOvertimes[0]
          ? {
              startTime: user.approvedOvertimes[0].startTime.toISOString(),
              endTime: user.approvedOvertimes[0].endTime.toISOString(),
              approvedBy: user.approvedOvertimes[0].approvedBy,
              approvedAt: user.approvedOvertimes[0].approvedAt.toISOString(),
            }
          : null,
      };

      console.log(
        `Constructed AttendanceStatus:`,
        JSON.stringify(result, null, 2),
      );

      return result;
    } catch (error) {
      console.error('Error in getLatestAttendanceStatus:', error);
      throw error;
    }
  }

  private async getInternalAttendanceRecord(
    userId: string,
  ): Promise<AttendanceRecord | null> {
    const attendance = await prisma.attendance.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    return attendance as AttendanceRecord | null;
  }

  private getLatestAttendanceRecord(
    internalAttendance: AttendanceRecord | null,
    externalCheckIn: ExternalCheckInData | null,
    externalCheckOut: ExternalCheckInData | null,
    shift: ShiftData,
  ): AttendanceRecord | null {
    if (!internalAttendance && !externalCheckIn && !externalCheckOut) {
      return null;
    }

    let latestRecord: AttendanceRecord = {
      id: '',
      userId: '',
      date: new Date(),
      checkInTime: null,
      checkOutTime: null,
      overtimeStartTime: null,
      overtimeEndTime: null,
      checkInLocation: null,
      checkOutLocation: null,
      checkInAddress: null,
      checkOutAddress: null,
      checkInReason: null,
      checkOutReason: null,
      checkInPhoto: null,
      checkOutPhoto: null,
      checkInDeviceSerial: null,
      checkOutDeviceSerial: null,
      status: 'checked-out',
      isManualEntry: false,
    };

    if (internalAttendance) {
      latestRecord = { ...internalAttendance };
    }

    if (externalCheckIn) {
      const externalCheckInTime = new Date(externalCheckIn.sj);
      const status = this.determineStatus(
        externalCheckInTime,
        externalCheckIn.fx,
        shift,
      );

      if (
        !latestRecord.checkInTime ||
        externalCheckInTime > latestRecord.checkInTime
      ) {
        latestRecord.checkInTime = externalCheckInTime;
        latestRecord.checkInDeviceSerial = externalCheckIn.dev_serial;

        if (status === 'checked-in') {
          latestRecord.status = 'checked-in';
        } else if (status === 'checked-out' && !latestRecord.checkOutTime) {
          latestRecord.checkOutTime = externalCheckInTime;
          latestRecord.checkOutDeviceSerial = externalCheckIn.dev_serial;
          latestRecord.status = 'checked-out';
        }
      }
    }

    if (externalCheckOut) {
      const externalCheckOutTime = new Date(externalCheckOut.sj);
      const status = this.determineStatus(
        externalCheckOutTime,
        externalCheckOut.fx,
        shift,
      );

      if (
        !latestRecord.checkOutTime ||
        externalCheckOutTime > latestRecord.checkOutTime
      ) {
        if (status === 'checked-out') {
          latestRecord.checkOutTime = externalCheckOutTime;
          latestRecord.checkOutDeviceSerial = externalCheckOut.dev_serial;
          latestRecord.status = 'checked-out';
        } else if (
          status === 'checked-in' &&
          (!latestRecord.checkInTime ||
            externalCheckOutTime > latestRecord.checkInTime)
        ) {
          latestRecord.checkInTime = externalCheckOutTime;
          latestRecord.checkInDeviceSerial = externalCheckOut.dev_serial;
          latestRecord.status = 'checked-in';
        }
      }
    }

    return latestRecord;
  }
  private determineStatus(
    checkTime: Date,
    checkType: number,
    shift: ShiftData,
  ): string {
    const now = new Date();

    if (checkType === 0) {
      // For automatic or unspecified check types, we need to determine based on the time and shift
      return this.determineAutoCheckStatus(checkTime, shift);
    }
    if (checkType === 1) return 'checked-in';
    if (checkType === 2) return 'checked-out';
    if (checkType === 3) return 'overtime-started';
    if (checkType === 4) return 'overtime-ended';

    // If it's an old record, assume it's completed
    if (checkTime.getDate() < now.getDate()) return 'completed';

    // Default case
    return 'unknown';
  }

  private determineAutoCheckStatus(checkTime: Date, shift: ShiftData): string {
    const shiftStart = this.getShiftDateTime(checkTime, shift.startTime);
    const shiftEnd = this.getShiftDateTime(checkTime, shift.endTime);

    // If the shift ends on the next day
    if (shiftEnd < shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    // Calculate the midpoint of the shift
    const shiftMidpoint = new Date(
      (shiftStart.getTime() + shiftEnd.getTime()) / 2,
    );

    if (checkTime < shiftMidpoint) {
      return 'checked-in';
    } else {
      return 'checked-out';
    }
  }

  private getShiftDateTime(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const shiftDateTime = new Date(date);
    shiftDateTime.setHours(hours, minutes, 0, 0);
    return shiftDateTime;
  }

  private determineIfCheckingIn(
    latestAttendance: AttendanceRecord | null,
  ): boolean {
    if (!latestAttendance) {
      return true; // If no attendance record, user needs to check in
    }

    if (latestAttendance.checkOutTime) {
      // If there's a check-out time, user needs to check in for a new cycle
      return true;
    }

    // If there's a check-in time but no check-out time, user needs to check out
    return false;
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

    const { user_serial, user_no, user_lname, user_dep, user_depname } =
      userInfo;
    console.log(
      'User info:',
      JSON.stringify(
        { user_serial, user_no, user_lname, user_dep, user_depname },
        null,
        2,
      ),
    );

    const user = await prisma.user.findUnique({
      where: { employeeId: user_no.toString() },
    });

    if (!user) {
      console.error('User not found for employee ID:', user_no);
      throw new Error('User not found');
    }

    const checkTime = new Date(externalCheckIn.sj);
    const startOfDay = new Date(
      checkTime.getFullYear(),
      checkTime.getMonth(),
      checkTime.getDate(),
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    let attendanceRecord = await prisma.attendance.findFirst({
      where: {
        userId: user.id,
        date: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    const isOvertime = this.isOvertime(checkTime, shift);

    if (!attendanceRecord) {
      // Create new record if none exists for the day
      return this.createAttendance(user.id, checkTime, isOvertime);
    } else if (!attendanceRecord.checkOutTime) {
      // Update existing record with check-out time
      return this.updateAttendance(attendanceRecord.id, checkTime, isOvertime);
    } else {
      // If there's already a complete record, log a warning and don't create a new one
      console.warn(
        `Duplicate check-in attempt for user ${user.id} on ${startOfDay.toISOString()}`,
      );
      return attendanceRecord;
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
        return await processingService.processCheckIn(
          user.id,
          checkTime,
          data.isOvertime || false,
        );
      } else {
        return await processingService.processCheckOut(
          user.id,
          checkTime,
          data.isOvertime || false,
        );
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

  private async getLatestShiftAdjustment(
    userId: string,
  ): Promise<ShiftAdjustment | null> {
    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId,
        status: 'approved',
        date: { gte: new Date() },
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return shiftAdjustment
      ? {
          ...shiftAdjustment,
          status: shiftAdjustment.status as 'pending' | 'approved' | 'rejected',
          requestedShift: shiftAdjustment.requestedShift as ShiftData,
        }
      : null;
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

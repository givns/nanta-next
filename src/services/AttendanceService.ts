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

    try {
      const user = await prisma.user.findUnique({
        where: { employeeId },
        include: { assignedShift: true, department: true },
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
      const [internalAttendance, externalData] = await Promise.all([
        this.getInternalAttendanceRecord(user.id),
        this.externalDbService.getLatestCheckIn(employeeId),
      ]);

      console.log('External data:', JSON.stringify(externalData, null, 2));

      // Determine the latest attendance record
      const latestAttendance = this.getLatestAttendanceRecord(
        internalAttendance,
        externalData?.checkIn || null,
      );

      const isCheckingIn = this.determineIfCheckingIn(latestAttendance);
      const shiftAdjustment = await this.getLatestShiftAdjustment(user.id);

      const result: AttendanceStatus = {
        user: {
          id: user.id,
          employeeId: user.employeeId,
          name: user.name,
          departmentId: user.departmentId,
          assignedShift: user.assignedShift as ShiftData,
        },
        latestAttendance,
        isCheckingIn,
        shiftAdjustment: shiftAdjustment
          ? {
              ...shiftAdjustment,
              status: shiftAdjustment.status as
                | 'pending'
                | 'approved'
                | 'rejected',
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
    internal: AttendanceRecord | null,
    external: ExternalCheckInData | null,
  ): AttendanceRecord | null {
    if (!internal && !external) return null;
    if (!internal) return this.convertExternalToAttendanceRecord(external!);
    if (!external) return internal;

    const internalDate = new Date(internal.date);
    const externalDate = new Date(external.sj);

    return internalDate > externalDate
      ? internal
      : this.convertExternalToAttendanceRecord(external);
  }

  private convertExternalToAttendanceRecord(
    external: ExternalCheckInData,
  ): AttendanceRecord {
    // Create a new Date object from the external date string
    const checkInDate = new Date(external.sj);

    return {
      id: external.iden || `external-${external.user_serial}-${external.date}`,
      userId: external.user_serial.toString(),
      date: new Date(external.date),
      checkInTime: checkInDate,
      checkOutTime: null, // Assume external data is for check-in only
      overtimeStartTime: null,
      overtimeEndTime: null,
      checkInLocation: null,
      checkOutLocation: null,
      checkInAddress: null,
      checkOutAddress: null,
      checkInReason: null,
      checkOutReason: null,
      checkInPhoto: 'N/A', // Assuming external system doesn't capture photos
      checkOutPhoto: null,
      checkInDeviceSerial: external.dev_serial,
      checkOutDeviceSerial: null,
      status: this.determineStatus(checkInDate, external.fx),
      isManualEntry: false,
    };
  }

  private determineStatus(checkInTime: Date, checkType: number): string {
    const now = new Date();
    if (checkType === 1) return 'checked-in';
    if (checkType === 2) return 'checked-out';
    if (checkType === 3) return 'overtime-started';
    if (checkType === 4) return 'overtime-ended';

    // If it's an old record, assume it's completed
    if (checkInTime.getDate() < now.getDate()) return 'completed';

    // Default case
    return 'checked-in';
  }

  private determineIfCheckingIn(
    latestAttendance: AttendanceRecord | null,
  ): boolean {
    if (!latestAttendance) return true;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (new Date(latestAttendance.date) < today) return true;
    if (latestAttendance.checkOutTime) return true;

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

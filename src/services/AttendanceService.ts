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
  FutureShiftAdjustment,
  ApprovedOvertime,
} from '../types/user';
import { UserRole } from '@/types/enum';
import moment from 'moment-timezone';

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
      const [internalAttendance, externalAttendanceData] = await Promise.all([
        this.getInternalAttendanceRecord(user.id),
        this.externalDbService.getDailyAttendanceRecords(employeeId),
      ]);

      console.log(
        'External attendance data:',
        JSON.stringify(externalAttendanceData, null, 2),
      );

      // Determine the latest attendance record
      const latestAttendance = this.getLatestAttendanceRecord(
        internalAttendance,
        externalAttendanceData.records,
        user.assignedShift as ShiftData,
      );
      const isCheckingIn = this.determineIfCheckingIn(latestAttendance);
      const today = moment().tz('Asia/Bangkok').startOf('day');
      const tomorrow = moment(today).add(1, 'day');
      const shift = user.assignedShift;
      const isWorkDay = shift.workDays.includes(today.day());
      const shiftAdjustment = await this.getLatestShiftAdjustment(user.id);
      const futureShiftAdjustments = await this.getFutureShiftAdjustments(
        user.id,
      );
      const futureApprovedOvertimes = await this.getFutureApprovedOvertimes(
        user.id,
      );
      const approvedOvertime = await prisma.overtimeRequest.findFirst({
        where: {
          userId: user.id,
          date: {
            gte: today.toDate(),
            lt: tomorrow.toDate(),
          },
          status: 'approved',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      let formattedApprovedOvertime: ApprovedOvertime | null = null;

      if (approvedOvertime) {
        formattedApprovedOvertime = {
          id: approvedOvertime.id,
          userId: approvedOvertime.userId,
          date: approvedOvertime.date,
          startTime: approvedOvertime.startTime,
          endTime: approvedOvertime.endTime,
          status: approvedOvertime.status,
          reason: approvedOvertime.reason,
          approvedBy: approvedOvertime.approverId || '',
          approvedAt: approvedOvertime.updatedAt,
        };
      }

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
          assignedShift: {
            id: user.assignedShift.id,
            shiftCode: user.assignedShift.shiftCode,
            name: user.assignedShift.name,
            startTime: user.assignedShift.startTime,
            endTime: user.assignedShift.endTime,
            workDays: user.assignedShift.workDays,
          },
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
        isCheckingIn: isCheckingIn,
        isDayOff: !isWorkDay,
        shiftAdjustment: shiftAdjustment
          ? {
              date: shiftAdjustment.date.toString(),
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
        futureShiftAdjustments,
        approvedOvertime: formattedApprovedOvertime,
        futureApprovedOvertimes,
        potentialOvertime: this.calculatePotentialOvertime(
          externalAttendanceData.records,
          user.assignedShift,
        ),
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
    externalRecords: ExternalCheckInData[],
    shift: ShiftData,
  ): AttendanceRecord | null {
    if (!internalAttendance && externalRecords.length === 0) {
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
      status: 'unknown',
      isManualEntry: false,
    };

    if (internalAttendance) {
      latestRecord = { ...internalAttendance };
    }

    if (externalRecords.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const shiftStart = this.getShiftDateTime(today, shift.startTime);
      const shiftEnd = this.getShiftDateTime(today, shift.endTime);

      // If shift ends next day
      if (shiftEnd <= shiftStart) {
        shiftEnd.setDate(shiftEnd.getDate() + 1);
      }

      let earliestCheckIn: Date | null = null;
      let latestCheckOut: Date | null = null;

      for (const record of externalRecords) {
        const checkTime = new Date(record.sj);
        const status = this.determineStatus(checkTime, record.fx, shift);

        // Check-in logic
        if (status === 'checked-in' || checkTime <= shiftEnd) {
          if (!earliestCheckIn || checkTime < earliestCheckIn) {
            earliestCheckIn = checkTime;
            latestRecord.checkInTime = checkTime;
            latestRecord.checkInDeviceSerial = record.dev_serial;
          }
        }

        // Check-out logic
        if (status === 'checked-out' || checkTime >= shiftStart) {
          if (!latestCheckOut || checkTime > latestCheckOut) {
            latestCheckOut = checkTime;
            latestRecord.checkOutTime = checkTime;
            latestRecord.checkOutDeviceSerial = record.dev_serial;
          }
        }

        // Overtime logic
        if (status === 'overtime-started') {
          latestRecord.overtimeStartTime = checkTime;
        } else if (status === 'overtime-ended') {
          latestRecord.overtimeEndTime = checkTime;
        }
      }

      // Determine final status
      if (latestRecord.checkInTime && latestRecord.checkOutTime) {
        latestRecord.status = 'checked-out';
      } else if (latestRecord.checkInTime) {
        latestRecord.status = 'checked-in';
      } else {
        latestRecord.status = 'unknown';
      }

      latestRecord.date = new Date(externalRecords[0].date);
      latestRecord.userId = externalRecords[0].user_serial.toString();
      latestRecord.id = externalRecords[0].bh.toString();
    }

    return latestRecord;
  }

  private calculatePotentialOvertime(
    records: any[],
    assignedShift: ShiftData,
  ): { start: string; end: string } | null {
    if (records.length < 2) return null;

    const firstRecord = moment(records[0].sj);
    const lastRecord = moment(records[records.length - 1].sj);

    const shiftStart = moment(assignedShift.startTime, 'HH:mm');
    const shiftEnd = moment(assignedShift.endTime, 'HH:mm');

    if (firstRecord.isBefore(shiftStart) || lastRecord.isAfter(shiftEnd)) {
      return {
        start: firstRecord.format('HH:mm'),
        end: lastRecord.format('HH:mm'),
      };
    }

    return null;
  }

  private getShiftDateTime(date: Date, timeString: string): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const shiftDateTime = new Date(date);
    shiftDateTime.setHours(hours, minutes, 0, 0);
    return shiftDateTime;
  }

  private determineStatus(
    checkTime: Date,
    checkType: number,
    shift: ShiftData,
  ): string {
    const shiftStart = this.getShiftDateTime(checkTime, shift.startTime);
    const shiftEnd = this.getShiftDateTime(checkTime, shift.endTime);

    // If shift ends next day
    if (shiftEnd <= shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    if (checkType === 0) {
      // For automatic or unspecified check types, determine based on the time and shift
      if (checkTime < shiftStart) {
        return 'checked-in'; // Early check-in
      } else if (checkTime > shiftEnd) {
        return 'checked-out'; // Late check-out
      } else {
        // Within shift, use midpoint to determine
        const shiftMidpoint = new Date(
          (shiftStart.getTime() + shiftEnd.getTime()) / 2,
        );
        return checkTime < shiftMidpoint ? 'checked-in' : 'checked-out';
      }
    }
    if (checkType === 1) return 'checked-in';
    if (checkType === 2) return 'checked-out';
    if (checkType === 3) return 'overtime-started';
    if (checkType === 4) return 'overtime-ended';

    // Default case
    return 'unknown';
  }

  private isAttendanceFromToday(attendance: AttendanceRecord): boolean {
    const today = new Date();
    const attendanceDate = new Date(attendance.date);
    return (
      attendanceDate.getDate() === today.getDate() &&
      attendanceDate.getMonth() === today.getMonth() &&
      attendanceDate.getFullYear() === today.getFullYear()
    );
  }

  private determineIfCheckingIn(
    latestAttendance: AttendanceRecord | null,
  ): boolean {
    if (!latestAttendance) {
      return true; // If no attendance record, user needs to check in
    }

    if (!this.isAttendanceFromToday(latestAttendance)) {
      return true; // If the latest attendance is not from today, user needs to check in
    }

    if (latestAttendance.checkOutTime) {
      return true; // If there's a check-out time for today, user needs to check in for a new cycle
    }

    return false; // User has checked in but not out, so they need to check out
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

    const attendanceRecord = await prisma.attendance.findFirst({
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
      let attendanceType:
        | 'regular'
        | 'flexible-start'
        | 'flexible-end'
        | 'grace-period'
        | 'overtime' = 'regular';

      if (data.isOvertime) {
        attendanceType = 'overtime';
      } else if (data.isFlexibleStart) {
        attendanceType = 'flexible-start';
      } else if (data.isFlexibleEnd) {
        attendanceType = 'flexible-end';
      } else if (data.isWithinGracePeriod) {
        attendanceType = 'grace-period';
      }

      if (data.isCheckIn) {
        return await processingService.processCheckIn(
          user.id,
          checkTime,
          attendanceType,
          {
            location: data.location,
            address: data.address,
            reason: data.reason,
            photo: data.photo,
            deviceSerial: data.deviceSerial,
          },
        );
      } else {
        return await processingService.processCheckOut(
          user.id,
          checkTime,
          attendanceType,
          {
            location: data.location,
            address: data.address,
            reason: data.reason,
            photo: data.photo,
            deviceSerial: data.deviceSerial,
          },
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

  private async getFutureApprovedOvertimes(
    userId: string,
  ): Promise<ApprovedOvertime[]> {
    const tomorrow = moment().tz('Asia/Bangkok').startOf('day').add(1, 'day');

    const futureOvertimes = await prisma.overtimeRequest.findMany({
      where: {
        userId: userId,
        date: {
          gte: tomorrow.toDate(),
        },
        status: 'approved',
      },
      orderBy: {
        date: 'asc',
      },
    });

    return futureOvertimes.map((overtime) => ({
      id: overtime.id,
      userId: overtime.userId,
      date: overtime.date,
      startTime: overtime.startTime,
      endTime: overtime.endTime,
      status: overtime.status,
      reason: overtime.reason,
      approvedBy: overtime.approverId || '',
      approvedAt: overtime.updatedAt,
    }));
  }

  private async getLatestShiftAdjustment(
    userId: string,
  ): Promise<ShiftAdjustment | null> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId,
        status: 'approved',
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: { requestedShift: true },
    });

    if (shiftAdjustment) {
      return {
        ...shiftAdjustment,
        date: shiftAdjustment.date.toISOString().split('T')[0], // Convert to YYYY-MM-DD string
        status: shiftAdjustment.status as 'pending' | 'approved' | 'rejected',
        requestedShift: shiftAdjustment.requestedShift as ShiftData,
      };
    }

    return null;
  }

  private async getFutureShiftAdjustments(
    userId: string,
  ): Promise<FutureShiftAdjustment[]> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const adjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        userId,
        date: { gte: tomorrow },
        status: 'approved',
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return adjustments.map((adj) => ({
      date: adj.date.toISOString(),
      shift: adj.requestedShift,
    }));
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

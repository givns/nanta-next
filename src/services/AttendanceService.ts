import { PrismaClient, Attendance } from '@prisma/client';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { ExternalDbService } from './ExternalDbService';
import { NotificationService } from './NotificationService';
import { HolidayService } from './HolidayService';
import { Shift104HolidayService } from './Shift104HolidayService';
import {
  ExternalCheckInData,
  AttendanceData,
  AttendanceStatus,
  AttendanceRecord,
  ShiftData,
  ShiftAdjustment,
  FutureShiftAdjustment,
  ApprovedOvertime,
  AttendanceStatusType,
} from '../types/user';
import { UserRole } from '@/types/enum';
import moment from 'moment-timezone';

type PrismaAttendanceRecord = {
  id: string;
  userId: string;
  date: Date;
  checkInTime: Date | null;
  checkOutTime: Date | null;
  isOvertime: boolean;
  overtimeStartTime: Date | null;
  overtimeEndTime: Date | null;
  checkInLocation: any;
  checkOutLocation: any;
  checkInAddress: string | null;
  checkOutAddress: string | null;
  checkInReason: string | null;
  checkOutReason: string | null;
  checkInPhoto: string | null;
  checkOutPhoto: string | null;
  checkInDeviceSerial: string | null;
  checkOutDeviceSerial: string | null;
  status: string;
  isManualEntry: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const prisma = new PrismaClient();
const processingService = new AttendanceProcessingService();
const notificationService = new NotificationService();

export class AttendanceService {
  private externalDbService: ExternalDbService;
  private holidayService: HolidayService;
  private shift104HolidayService: Shift104HolidayService;

  constructor() {
    this.externalDbService = new ExternalDbService();
    this.holidayService = new HolidayService();
    this.shift104HolidayService = new Shift104HolidayService();
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

      // Fetch both internal and external attendance data for the past 2 days
      const twoDaysAgo = moment().subtract(2, 'days').startOf('day').toDate();
      const [internalAttendances, externalAttendanceData] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            userId: user.id,
            date: { gte: twoDaysAgo },
          },
          orderBy: { date: 'desc' },
        }),
        this.externalDbService.getDailyAttendanceRecords(employeeId, 2),
      ]);

      const latestAttendance = this.getLatestAttendanceRecord(
        internalAttendances,
        externalAttendanceData.records,
        user.assignedShift as ShiftData,
      );

      console.log(
        'Latest attendance record:',
        JSON.stringify(latestAttendance, null, 2),
      );

      const now = moment().tz('Asia/Bangkok');
      const today = now.clone().startOf('day');
      const shift = user.assignedShift;

      const shiftStart = moment(today).set({
        hour: parseInt(shift.startTime.split(':')[0]),
        minute: parseInt(shift.startTime.split(':')[1]),
      });
      const shiftEnd = moment(today).set({
        hour: parseInt(shift.endTime.split(':')[0]),
        minute: parseInt(shift.endTime.split(':')[1]),
      });
      if (shiftEnd.isBefore(shiftStart)) {
        shiftEnd.add(1, 'day');
      }

      console.log('Shift start:', shiftStart.format());
      console.log('Shift end:', shiftEnd.format());

      let isCheckingIn = true;
      if (latestAttendance) {
        const now = new Date();
        const attendanceDate = new Date(latestAttendance.date);
        const isFromToday =
          attendanceDate.getDate() === now.getDate() &&
          attendanceDate.getMonth() === now.getMonth() &&
          attendanceDate.getFullYear() === now.getFullYear();

        if (isFromToday) {
          isCheckingIn = !!latestAttendance.checkOutTime;
        }
      }

      console.log('Initial isCheckingIn:', isCheckingIn);

      const isWorkDay = await this.holidayService.isWorkingDay(
        user.id,
        today.toDate(),
      );

      console.log('Is work day:', isWorkDay);
      let isDayOff = !isWorkDay;

      // For SHIFT104, check if it's a holiday
      if (user.assignedShift.shiftCode === 'SHIFT104') {
        const isShift104Holiday =
          await this.shift104HolidayService.isShift104Holiday(today.toDate());
        if (isShift104Holiday) {
          isDayOff = true;
        }
      }

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
            lt: today.clone().add(1, 'day').toDate(),
          },
          status: 'approved',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      console.log(
        'Approved overtime:',
        JSON.stringify(approvedOvertime, null, 2),
      );

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

      const potentialOvertime =
        latestAttendance &&
        !latestAttendance.checkOutTime &&
        now.isAfter(shiftEnd)
          ? {
              start: shiftEnd.format('HH:mm'),
              end: now.isAfter(shiftEnd.clone().add(1, 'day'))
                ? now.format('HH:mm')
                : '23:59',
            }
          : null;

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
              status: latestAttendance.status as AttendanceStatusType,
              isManualEntry: latestAttendance.isManualEntry,
            }
          : null,
        isCheckingIn: isCheckingIn,
        isDayOff: isDayOff,
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
        potentialOvertime: potentialOvertime,
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
    internalAttendances: PrismaAttendanceRecord[],
    externalRecords: ExternalCheckInData[],
    shift: ShiftData,
  ): AttendanceRecord | null {
    // Combine internal and external records
    const allRecords = [
      ...internalAttendances,
      ...externalRecords.map(this.convertExternalToInternal),
    ];

    // Sort all records by date and time
    allRecords.sort(
      (a, b) => a.checkInTime!.getTime() - b.checkInTime!.getTime(),
    );

    if (allRecords.length === 0) return null;

    const lastRecord = allRecords[allRecords.length - 1];
    const recordDate = new Date(lastRecord.date);

    const shiftStart = moment(recordDate).set({
      hour: parseInt(shift.startTime.split(':')[0]),
      minute: parseInt(shift.startTime.split(':')[1]),
    });

    const shiftEnd = moment(shiftStart)
      .add(24, 'hours')
      .set({
        hour: parseInt(shift.endTime.split(':')[0]),
        minute: parseInt(shift.endTime.split(':')[1]),
      });

    let latestCheckIn: AttendanceRecord | null = null;
    let latestCheckOut: AttendanceRecord | null = null;

    for (const record of allRecords) {
      const recordTime = moment(record.checkInTime);

      // Handle check-in
      if (!latestCheckIn || recordTime.isBefore(shiftStart)) {
        if (
          recordTime.isBetween(
            shiftStart.clone().subtract(1, 'hour'),
            shiftStart,
          )
        ) {
          latestCheckIn = record;
          latestCheckIn.status = 'early-check-in';
          latestCheckIn.isOvertime = false;
        } else if (
          recordTime.isBefore(shiftStart.clone().subtract(1, 'hour'))
        ) {
          latestCheckIn = record;
          latestCheckIn.status = 'overtime-started';
          latestCheckIn.isOvertime = true;
        } else {
          latestCheckIn = record;
          latestCheckIn.status = 'checked-in';
          latestCheckIn.isOvertime = false;
        }
      }

      // Handle check-out
      if (
        recordTime.isAfter(shiftEnd) ||
        (recordTime.isAfter(shiftStart) && record.checkOutTime)
      ) {
        if (recordTime.isBefore(shiftEnd.clone().add(1, 'hour'))) {
          latestCheckOut = record;
          latestCheckOut.status = 'late-check-out';
          latestCheckOut.isOvertime = false;
        } else {
          latestCheckOut = record;
          latestCheckOut.status = 'overtime-ended';
          latestCheckOut.isOvertime = true;
        }
      }
    }

    // Combine check-in and check-out information
    if (latestCheckIn && latestCheckOut) {
      latestCheckIn.checkOutTime = latestCheckOut.checkInTime;
      latestCheckIn.checkOutLocation = latestCheckOut.checkInLocation;
      latestCheckIn.checkOutAddress = latestCheckOut.checkInAddress;
      latestCheckIn.checkOutDeviceSerial = latestCheckOut.checkInDeviceSerial;
      latestCheckIn.status = latestCheckOut.status;
      latestCheckIn.isOvertime =
        latestCheckIn.isOvertime || latestCheckOut.isOvertime;
      return latestCheckIn;
    }

    return latestCheckIn || latestCheckOut;
  }

  private convertExternalToInternal(
    external: ExternalCheckInData,
  ): AttendanceRecord {
    return {
      id: external.bh.toString(),
      userId: external.user_serial.toString(),
      date: new Date(external.date),
      checkInTime: new Date(external.sj),
      checkOutTime: null,
      isOvertime: false,
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
      checkInDeviceSerial: external.dev_serial,
      checkOutDeviceSerial: null,
      status: 'checked-in',
      isManualEntry: false,
    };
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

  async getTodayCheckIn(userId: string): Promise<Attendance | null> {
    const today = moment().tz('Asia/Bangkok').startOf('day');
    return prisma.attendance.findFirst({
      where: {
        userId,
        date: {
          gte: today.toDate(),
          lt: today.add(1, 'day').toDate(),
        },
        checkInTime: { not: null },
      },
    });
  }

  async createPendingAttendance(
    userId: string,
    potentialCheckInTime: Date,
    checkOutTime: Date,
  ): Promise<Attendance> {
    return prisma.attendance.create({
      data: {
        userId,
        date: moment(potentialCheckInTime)
          .tz('Asia/Bangkok')
          .startOf('day')
          .toDate(),
        checkInTime: potentialCheckInTime,
        checkOutTime,
        status: 'PENDING_APPROVAL',
        checkInLocation: 'UNKNOWN', // Add this line
        checkOutLocation: 'UNKNOWN', // Add this line if required
      },
    });
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
    let shiftEnd = new Date(checkTime);
    shiftEnd.setHours(
      parseInt(shift.endTime.split(':')[0]),
      parseInt(shift.endTime.split(':')[1]),
      0,
      0,
    );
    if (shiftEnd <= shiftStart) shiftEnd.setDate(shiftEnd.getDate() + 1);

    const oneHourBeforeShift = new Date(shiftStart.getTime() - 60 * 60 * 1000);

    return checkTime < oneHourBeforeShift || checkTime > shiftEnd;
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

      const now = moment().tz('Asia/Bangkok');
      const todayStart = moment(now).startOf('day');

      // Check for ongoing overtime from previous day
      const latestAttendance = await this.getInternalAttendanceRecord(user.id);
      if (
        latestAttendance &&
        moment(latestAttendance.checkInTime).isBefore(todayStart) &&
        latestAttendance.status === 'overtime-started'
      ) {
        attendanceType = 'overtime';
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
            isLate: data.isLate,
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

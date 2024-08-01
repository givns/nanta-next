// services/AttendanceService.ts

import { PrismaClient, User, Attendance, Shift, Prisma } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { NotificationService } from './NotificationService';
import { ShiftManagementService } from './ShiftManagementService';
import { HolidayService } from './HolidayService';
import { Shift104HolidayService } from './Shift104HolidayService';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import {
  ExternalCheckInData,
  AttendanceData,
  AttendanceStatus,
  AttendanceRecord,
  ShiftData,
  ApprovedOvertime,
  AttendanceStatusType,
  UserData,
  Location,
} from '../types/user';
import { UserRole } from '@/types/enum';
import { getDeviceType } from '@/utils/deviceUtils';
import { logMessage } from '../utils/inMemoryLogger';
import moment from 'moment-timezone';

const prisma = new PrismaClient();

export interface ShiftAdjustment {
  shiftId: any;
  date: string;
  requestedShiftId: string;
  requestedShift: ShiftData;
  status: string;
}

export interface FutureShiftAdjustment {
  date: string;
  shift: ShiftData;
}

export class AttendanceService {
  private externalDbService: ExternalDbService;
  private notificationService: NotificationService;
  private shiftManagementService: ShiftManagementService;
  private holidayService: HolidayService;
  private shift104HolidayService: Shift104HolidayService;
  private overtimeService: OvertimeServiceServer;
  private readonly TIMEZONE = 'Asia/Bangkok';
  private readonly OVERTIME_INCREMENT_MINUTES = 30;

  constructor() {
    this.externalDbService = new ExternalDbService();
    this.notificationService = new NotificationService();
    this.shiftManagementService = new ShiftManagementService();
    this.holidayService = new HolidayService();
    this.shift104HolidayService = new Shift104HolidayService();
    this.overtimeService = new OvertimeServiceServer();
  }

  async initializeUserAttendanceData(userId: string): Promise<void> {
    logMessage(`Initializing attendance data for user: ${userId}`);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true, department: true },
    });
    if (!user) {
      logMessage(`User not found: ${userId}`);
      throw new Error('User not found');
    }

    const now = moment().tz(this.TIMEZONE);
    const startDate = moment(now).subtract(1, 'month').date(25).startOf('day');
    const endDate = now;

    logMessage(
      `Fetching attendance data from ${startDate.format()} to ${endDate.format()}`,
    );
    const { records } = await this.externalDbService.getDailyAttendanceRecords(
      user.employeeId,
      startDate.toDate(),
      endDate.toDate(),
    );
    logMessage(`Fetched ${records.length} external attendance records`);

    await this.processAndStoreAttendanceData(userId, records);
    logMessage(`Attendance data initialization completed for user: ${userId}`);
  }

  private async processAndStoreAttendanceData(
    userId: string,
    externalRecords: ExternalCheckInData[],
  ): Promise<void> {
    logMessage(
      `Processing and storing ${externalRecords.length} attendance records for user: ${userId}`,
    );
    for (const record of externalRecords) {
      await this.createOrUpdateAttendance(userId, record);
    }
  }

  private async createOrUpdateAttendance(
    userId: string,
    record: ExternalCheckInData,
  ): Promise<void> {
    const date = moment.tz(record.sj, this.TIMEZONE).startOf('day');

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        userId,
        date: date.toDate(),
      },
    });

    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      userId,
      date.toDate(),
    );
    if (!effectiveShift) {
      logMessage(
        `No effective shift found for user ${userId} on ${date.format('YYYY-MM-DD')}`,
      );
      return;
    }

    const attendanceData = this.mapExternalRecordToAttendanceData(
      record,
      effectiveShift.shift,
      existingAttendance,
    );

    if (existingAttendance) {
      logMessage(
        `Updating existing attendance record for date: ${date.format('YYYY-MM-DD')}`,
      );
      await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: attendanceData,
      });
    } else {
      logMessage(
        `Creating new attendance record for date: ${date.format('YYYY-MM-DD')}`,
      );
      await prisma.attendance.create({
        data: {
          userId,
          ...attendanceData,
        } as Prisma.AttendanceUncheckedCreateInput,
      });
    }
  }

  private mapExternalRecordToAttendanceData(
    record: ExternalCheckInData,
    shift: ShiftData,
    existingAttendance: Attendance | null,
  ): Prisma.AttendanceUncheckedUpdateInput {
    const checkTime = moment.tz(record.sj, this.TIMEZONE);
    const shiftStart = this.getShiftStartTime(checkTime, shift);
    const shiftEnd = this.getShiftEndTime(checkTime, shift);

    let isCheckIn = this.determineCheckInStatus(
      checkTime,
      existingAttendance,
      shiftStart,
      shiftEnd,
    );

    const status = this.determineAttendanceStatus(
      checkTime,
      shiftStart,
      shiftEnd,
      isCheckIn,
      shift,
    );
    const isOvertime = this.isOvertime(checkTime, shiftEnd);

    // We'll calculate these values but not include them in the return object
    const isEarlyCheckIn = isCheckIn
      ? this.isEarlyCheckIn(checkTime, shift)
      : false;
    const isLateCheckIn = isCheckIn
      ? this.isLateCheckIn(checkTime, shift)
      : false;
    const isLateCheckOut = !isCheckIn
      ? this.isLateCheckOut(checkTime, shiftStart, shiftEnd, shift)
      : false;
    const overtimeHours = isOvertime
      ? this.calculateOvertimeHours(checkTime, shiftEnd)
      : 0;

    // Log these values for debugging or future use
    logMessage(
      `Early Check-In: ${isEarlyCheckIn}, Late Check-In: ${isLateCheckIn}, Late Check-Out: ${isLateCheckOut}, Overtime Hours: ${overtimeHours}`,
    );

    return {
      date: checkTime.startOf('day').toDate(),
      [isCheckIn ? 'checkInTime' : 'checkOutTime']: checkTime.toDate(),
      status,
      isOvertime,
      [isCheckIn ? 'checkInDeviceSerial' : 'checkOutDeviceSerial']:
        record.dev_serial,
      [isCheckIn ? 'checkInLocation' : 'checkOutLocation']: JSON.stringify({
        lat: 0,
        lng: 0,
      }),
    };
  }

  private getShiftStartTime(
    date: moment.Moment,
    shift: ShiftData,
  ): moment.Moment {
    const [startHour, startMinute] = shift.startTime.split(':').map(Number);
    return moment(date).set({
      hour: startHour,
      minute: startMinute,
      second: 0,
      millisecond: 0,
    });
  }

  private getShiftEndTime(
    date: moment.Moment,
    shift: ShiftData,
  ): moment.Moment {
    const [endHour, endMinute] = shift.endTime.split(':').map(Number);
    let endTime = moment(date).set({
      hour: endHour,
      minute: endMinute,
      second: 0,
      millisecond: 0,
    });
    if (endTime.isBefore(date)) {
      endTime.add(1, 'day');
    }
    return endTime;
  }

  private isOvertime(
    checkTime: moment.Moment,
    shiftEnd: moment.Moment,
  ): boolean {
    return checkTime.isAfter(shiftEnd);
  }

  private determineCheckInStatus(
    checkTime: moment.Moment,
    existingAttendance: Attendance | null,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
  ): boolean {
    if (!existingAttendance || !existingAttendance.checkInTime) {
      return true;
    } else if (
      existingAttendance.checkInTime &&
      !existingAttendance.checkOutTime
    ) {
      return false;
    } else {
      const shiftMidpoint = moment(shiftStart).add(
        shiftEnd.diff(shiftStart) / 2,
        'milliseconds',
      );
      return checkTime.isBefore(shiftMidpoint);
    }
  }

  private determineAttendanceStatus(
    checkTime: moment.Moment,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
    isCheckIn: boolean,
    shift: ShiftData,
  ): AttendanceStatusType {
    if (isCheckIn) {
      if (this.isEarlyCheckIn(checkTime, shift)) return 'early-check-in';
      if (this.isLateCheckIn(checkTime, shift)) return 'late-check-in';
      return 'checked-in';
    } else {
      if (checkTime.isBefore(shiftEnd)) return 'early-check-out';
      if (this.isLateCheckOut(checkTime, shiftStart, shiftEnd, shift))
        return 'late-check-out';
      return 'checked-out';
    }
  }

  private isEarlyCheckIn(checkTime: moment.Moment, shift: ShiftData): boolean {
    const shiftStart = moment(checkTime).set({
      hour: parseInt(shift.startTime.split(':')[0]),
      minute: parseInt(shift.startTime.split(':')[1]),
      second: 0,
      millisecond: 0,
    });
    return checkTime.isBefore(shiftStart.subtract(30, 'minutes'));
  }

  private isLateCheckIn(checkTime: moment.Moment, shift: ShiftData): boolean {
    const shiftStart = moment(checkTime).set({
      hour: parseInt(shift.startTime.split(':')[0]),
      minute: parseInt(shift.startTime.split(':')[1]),
      second: 0,
      millisecond: 0,
    });
    return checkTime.isAfter(shiftStart.add(5, 'minutes'));
  }

  private isLateCheckOut(
    checkTime: moment.Moment,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
    shift: ShiftData,
  ): boolean {
    const lateCheckOutStart = shiftEnd.clone().add(15, 'minutes');
    const lateCheckOutEnd = shiftEnd.clone().add(30, 'minutes');
    return (
      checkTime.isAfter(lateCheckOutStart) &&
      checkTime.isBefore(lateCheckOutEnd)
    );
  }

  private calculateOvertimeHours(
    checkTime: moment.Moment,
    shiftEnd: moment.Moment,
  ): number {
    if (!this.isOvertime(checkTime, shiftEnd)) return 0;
    const overtimeMinutes = checkTime.diff(shiftEnd, 'minutes');
    return (
      Math.floor(overtimeMinutes / this.OVERTIME_INCREMENT_MINUTES) *
      (this.OVERTIME_INCREMENT_MINUTES / 60)
    );
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatus> {
    logMessage(
      `Getting latest attendance status for employee ID: ${employeeId}`,
    );

    const user = await this.getUserWithShift(employeeId);
    if (!user) {
      logMessage(`User not found for employee ID: ${employeeId}`);
      throw new Error('User not found');
    }

    const now = moment().tz(this.TIMEZONE);
    const today = now.clone().startOf('day');

    const threeDaysAgo = today.clone().subtract(3, 'days');
    const startDate = new Date(now.year(), now.month(), now.date() - 3);
    const endDate = new Date();

    const [internalAttendances, externalAttendanceData] = await Promise.all([
      this.getInternalAttendances(user.id, threeDaysAgo.toDate()),
      this.externalDbService.getDailyAttendanceRecords(
        employeeId,
        startDate,
        endDate,
      ),
    ]);

    logMessage(`Internal attendances: ${JSON.stringify(internalAttendances)}`);
    logMessage(
      `External attendance data: ${JSON.stringify(externalAttendanceData)}`,
    );

    const latestAttendance = await this.getLatestAttendanceRecord(
      internalAttendances,
      externalAttendanceData.records,
      user.assignedShift,
      employeeId,
    );

    logMessage(`Latest attendance: ${JSON.stringify(latestAttendance)}`);

    const isDayOff = await this.isDayOff(user, today.toDate());
    const shiftAdjustment = await this.getLatestShiftAdjustment(user.id);
    const futureShiftAdjustments = await this.getFutureShiftAdjustments(
      user.id,
    );
    const approvedOvertime = await this.getApprovedOvertime(
      user.id,
      today.toDate(),
    );
    const futureApprovedOvertimes = await this.getFutureApprovedOvertimes(
      user.id,
    );

    const potentialOvertime = this.calculatePotentialOvertime(
      latestAttendance,
      user.assignedShift,
    );

    const { status } = this.determineStatus(
      latestAttendance,
      user.assignedShift,
      isDayOff,
      now,
    );

    return {
      user: {
        ...this.mapUserData({
          ...user,
          department: { name: user.departmentId },
        }),
      },
      latestAttendance,
      status,
      isCheckingIn: this.isCheckingIn(latestAttendance),
      isDayOff,
      shiftAdjustment,
      futureShiftAdjustments: futureShiftAdjustments.map((adjustment) => ({
        date: adjustment.date,
        shift: adjustment.shiftId, // Update 'shiftId' to 'shift'
      })),
      approvedOvertime,
      futureApprovedOvertimes,
      potentialOvertime,
    };
  }

  private async getUserWithShift(
    employeeId: string,
  ): Promise<(User & { assignedShift: Shift }) | null> {
    return prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true, department: true },
    });
  }

  private async getInternalAttendances(
    userId: string,
    startDate: Date,
  ): Promise<Attendance[]> {
    return prisma.attendance.findMany({
      where: {
        userId,
        date: { gte: startDate },
      },
      orderBy: { date: 'desc' },
    });
  }

  private async getLatestAttendanceRecord(
    internalAttendances: Attendance[],
    externalRecords: ExternalCheckInData[],
    shift: Shift,
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    logMessage(
      `Getting latest attendance record for employee ID: ${employeeId}`,
    );
    const convertedExternalRecords = externalRecords.map((record) =>
      this.convertExternalToInternal(record),
    );
    const allRecords = [...internalAttendances, ...convertedExternalRecords];
    const groupedRecords = this.groupRecordsByDate(allRecords, shift);

    const combinedRecords = Object.entries(groupedRecords).map(
      ([date, records]) => {
        return this.combineRecords(records);
      },
    );

    const sortedRecords = combinedRecords.sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
    const latestRecord = sortedRecords[0] || null;

    if (latestRecord) {
      const { status, isOvertime, overtimeDuration, overtimeStartTime } =
        this.determineStatus(latestRecord, shift, false, moment());
      latestRecord.status = status;
      latestRecord.isOvertime = isOvertime;
      latestRecord.overtimeDuration = overtimeDuration;
      latestRecord.overtimeStartTime = overtimeStartTime
        ? overtimeStartTime.toDate()
        : null;
    }

    logMessage(`Latest attendance record: ${JSON.stringify(latestRecord)}`);
    return latestRecord;
  }

  private convertExternalToInternal(
    external: ExternalCheckInData,
  ): AttendanceRecord {
    const recordDate = new Date(external.date);
    const recordTime = external.time.split(':').map(Number);
    const checkTime = new Date(
      recordDate.setHours(recordTime[0], recordTime[1], recordTime[2] || 0),
    );

    return {
      id: external.bh.toString(),
      userId: '',
      employeeId: external.user_no,
      date: new Date(recordDate.setHours(0, 0, 0, 0)),
      checkInTime: external.fx === 1 ? checkTime : null,
      checkOutTime: external.fx === 2 ? checkTime : null,
      checkInDeviceSerial: external.fx === 1 ? external.dev_serial : null,
      checkOutDeviceSerial: external.fx === 2 ? external.dev_serial : null,
      status: 'pending',
      isManualEntry: false,
      isOvertime: false,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      overtimeHours: 0,
      overtimeStartTime: null,
      overtimeEndTime: null,
      checkInLocation: null,
      checkOutLocation: null,
      checkInAddress: null,
      checkOutAddress: null,
      checkInReason: null,
      checkOutReason: null, // Add the missing property
      checkInPhoto: null, // Add the missing property
      checkOutPhoto: null, // Add the missing property
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private groupRecordsByDate(
    records: (Attendance | AttendanceRecord)[],
    shift: Shift,
  ): Record<string, (Attendance | AttendanceRecord)[]> {
    const recordsByDate: Record<string, (Attendance | AttendanceRecord)[]> = {};
    const shiftStartHour = parseInt(shift.startTime.split(':')[0]);

    records.forEach((record) => {
      if (record.checkInTime) {
        const recordDate = new Date(record.checkInTime);
        if (recordDate.getHours() < shiftStartHour) {
          recordDate.setDate(recordDate.getDate() - 1);
        }
        const dateKey = `${recordDate.toISOString().split('T')[0]}-${(record as AttendanceRecord).employeeId || (record as Attendance).userId}`;
        if (!recordsByDate[dateKey]) {
          recordsByDate[dateKey] = [];
        }
        recordsByDate[dateKey].push(record);
      }
    });

    return recordsByDate;
  }

  private combineRecords(
    records: (Attendance | AttendanceRecord)[],
  ): AttendanceRecord {
    const employeeId = (records[0] as AttendanceRecord).employeeId || 'unknown';
    const internalRecord = records.find(
      (record) => 'userId' in record && record.userId === employeeId,
    ) as Attendance | undefined;

    if (internalRecord) {
      return this.convertAttendanceToRecord(internalRecord);
    }

    const firstRecord = records[0] as AttendanceRecord;
    return records.reduce<AttendanceRecord>(
      (combined, current) => {
        const currentRecord = current as Partial<AttendanceRecord>;
        return {
          ...combined,
          checkInTime:
            !combined.checkInTime ||
            (currentRecord.checkInTime &&
              currentRecord.checkInTime < combined.checkInTime)
              ? currentRecord.checkInTime || null
              : combined.checkInTime,
          checkOutTime:
            !combined.checkOutTime ||
            (currentRecord.checkOutTime &&
              currentRecord.checkOutTime > combined.checkOutTime)
              ? currentRecord.checkOutTime || null
              : combined.checkOutTime,
          employeeId: currentRecord.employeeId || combined.employeeId,
        };
      },
      {
        ...this.initializeAttendanceRecord(firstRecord),
        employeeId: firstRecord.employeeId || 'unknown',
      },
    );
  }

  private convertAttendanceToRecord(attendance: Attendance): AttendanceRecord {
    return {
      id: attendance.id,
      userId: attendance.userId,
      employeeId: attendance.userId, // Assuming userId is used as employeeId
      date: attendance.date,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      isOvertime: attendance.isOvertime,
      overtimeStartTime: attendance.overtimeStartTime,
      overtimeEndTime: attendance.overtimeEndTime,
      checkInLocation: this.parseJsonLocation(attendance.checkInLocation),
      checkOutLocation: this.parseJsonLocation(attendance.checkOutLocation),
      checkInAddress: attendance.checkInAddress,
      checkOutAddress: attendance.checkOutAddress,
      checkInReason: attendance.checkInReason,
      checkOutReason: attendance.checkOutReason,
      checkInPhoto: attendance.checkInPhoto,
      checkOutPhoto: attendance.checkOutPhoto,
      checkInDeviceSerial: attendance.checkInDeviceSerial,
      checkOutDeviceSerial: attendance.checkOutDeviceSerial,
      status: attendance.status,
      isManualEntry: attendance.isManualEntry,
      overtimeHours: 0, // You may need to calculate this based on your business logic
      isEarlyCheckIn: false, // You may need to calculate this based on your business logic
      isLateCheckIn: false, // You may need to calculate this based on your business logic
      isLateCheckOut: false, // You may need to calculate this based on your business logic
      createdAt: attendance.createdAt,
      updatedAt: attendance.updatedAt,
    };
  }

  private initializeAttendanceRecord(
    record: Partial<AttendanceRecord>,
  ): AttendanceRecord {
    return {
      id: record.id || '',
      userId: record.userId || '',
      employeeId: record.employeeId || '',
      date: record.date || new Date(),
      checkInTime: record.checkInTime || null,
      checkOutTime: record.checkOutTime || null,
      isOvertime: record.isOvertime || false,
      overtimeStartTime: record.overtimeStartTime || null,
      overtimeEndTime: record.overtimeEndTime || null,
      checkInLocation: record.checkInLocation || null,
      checkOutLocation: record.checkOutLocation || null,
      checkInAddress: record.checkInAddress || null,
      checkOutAddress: record.checkOutAddress || null,
      checkInReason: record.checkInReason || null,
      checkOutReason: record.checkOutReason || null,
      checkInPhoto: record.checkInPhoto || null,
      checkOutPhoto: record.checkOutPhoto || null,
      checkInDeviceSerial: record.checkInDeviceSerial || null,
      checkOutDeviceSerial: record.checkOutDeviceSerial || null,
      status: record.status || '',
      isManualEntry: record.isManualEntry || false,
      overtimeHours: record.overtimeHours || 0,
      isEarlyCheckIn: record.isEarlyCheckIn || false,
      isLateCheckIn: record.isLateCheckIn || false,
      isLateCheckOut: record.isLateCheckOut || false,
      createdAt: record.createdAt || new Date(),
      updatedAt: record.updatedAt || new Date(),
    };
  }

  private async isDayOff(
    user: User & { assignedShift: Shift },
    date: Date,
  ): Promise<boolean> {
    const isWorkDay = await this.holidayService.isWorkingDay(user.id, date);
    if (!isWorkDay) return true;

    if (user.assignedShift.shiftCode === 'SHIFT104') {
      return this.shift104HolidayService.isShift104Holiday(date);
    }

    return false;
  }

  private parseJsonLocation(location: any): Location | null {
    if (typeof location === 'string') {
      try {
        const parsed = JSON.parse(location);
        if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          return { lat: parsed.lat, lng: parsed.lng };
        }
      } catch (e) {
        console.error('Error parsing location JSON:', e);
      }
    } else if (
      location &&
      typeof location.lat === 'number' &&
      typeof location.lng === 'number'
    ) {
      return { lat: location.lat, lng: location.lng };
    }
    return null;
  }

  private isCheckingIn(latestAttendance: AttendanceRecord | null): boolean {
    if (!latestAttendance) return true;
    if (latestAttendance.checkOutTime) {
      const lastCheckOutTime = new Date(latestAttendance.checkOutTime);
      const currentTime = new Date();
      return (
        (currentTime.getTime() - lastCheckOutTime.getTime()) /
          (1000 * 60 * 60) >=
        1
      );
    }
    return false;
  }

  private async getApprovedOvertime(
    userId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    return this.overtimeService.getApprovedOvertimeRequest(userId, date);
  }

  private async getFutureApprovedOvertimes(
    userId: string,
  ): Promise<ApprovedOvertime[]> {
    const tomorrow = moment().tz(this.TIMEZONE).startOf('day').add(1, 'day');
    return this.overtimeService.getFutureApprovedOvertimes(
      userId,
      tomorrow.toDate(),
    );
  }

  private async getLatestShiftAdjustment(
    userId: string,
  ): Promise<ShiftAdjustment | null> {
    return this.shiftManagementService.RequestShiftAdjustment(userId);
  }

  async getFutureShiftAdjustments(userId: string): Promise<ShiftAdjustment[]> {
    const adjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        userId,
        date: { gte: new Date() },
        status: 'approved',
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return adjustments.map((adj) => ({
      shiftId: adj.requestedShiftId, // Add the missing shiftId property
      date: adj.date.toISOString(),
      shift: this.convertToShiftData(adj.requestedShift),
      requestedShiftId: adj.requestedShiftId,
      requestedShift: adj.requestedShift,
      status: adj.status,
    }));
  }

  private calculatePotentialOvertime(
    latestAttendance: AttendanceRecord | null,
    shift: Shift,
  ): { start: string; end: string } | null {
    if (
      !latestAttendance ||
      !latestAttendance.checkInTime ||
      !latestAttendance.checkOutTime
    ) {
      return null;
    }

    const checkInTime = moment(latestAttendance.checkInTime).tz(this.TIMEZONE);
    const checkOutTime = moment(latestAttendance.checkOutTime).tz(
      this.TIMEZONE,
    );
    const shiftStart = moment(checkInTime).set({
      hour: parseInt(shift.startTime.split(':')[0]),
      minute: parseInt(shift.startTime.split(':')[1]),
      second: 0,
      millisecond: 0,
    });
    const shiftEnd = moment(checkInTime).set({
      hour: parseInt(shift.endTime.split(':')[0]),
      minute: parseInt(shift.endTime.split(':')[1]),
      second: 0,
      millisecond: 0,
    });

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    const thirtyMinutesBeforeShift = moment(shiftStart).subtract(30, 'minutes');

    if (
      checkInTime.isBefore(thirtyMinutesBeforeShift) ||
      checkOutTime.isAfter(shiftEnd)
    ) {
      return {
        start: checkInTime.isBefore(thirtyMinutesBeforeShift)
          ? checkInTime.format('HH:mm')
          : shiftEnd.format('HH:mm'),
        end: checkOutTime.format('HH:mm'),
      };
    }

    return null;
  }

  private determineStatus(
    attendance: AttendanceRecord | null,
    shift: Shift,
    isDayOff: boolean,
    now: moment.Moment,
  ): {
    status: AttendanceStatusType;
    isOvertime: boolean;
    overtimeDuration: number;
    overtimeStartTime: moment.Moment | null;
  } {
    if (isDayOff)
      return {
        status: 'day-off',
        isOvertime: false,
        overtimeDuration: 0,
        overtimeStartTime: null,
      };
    if (!attendance)
      return {
        status: 'not-checked-in',
        isOvertime: false,
        overtimeDuration: 0,
        overtimeStartTime: null,
      };

    const checkOutTime = attendance.checkOutTime
      ? moment(attendance.checkOutTime).tz(this.TIMEZONE)
      : null;
    const shiftStart = moment(attendance.date)
      .tz(this.TIMEZONE)
      .set({
        hour: parseInt(shift.startTime.split(':')[0]),
        minute: parseInt(shift.startTime.split(':')[1]),
      });
    const shiftEnd = moment(attendance.date)
      .tz(this.TIMEZONE)
      .set({
        hour: parseInt(shift.endTime.split(':')[0]),
        minute: parseInt(shift.endTime.split(':')[1]),
      });

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    if (checkOutTime) {
      if (checkOutTime.isAfter(shiftEnd)) {
        const overtimeDuration = checkOutTime.diff(shiftEnd, 'minutes');
        const roundedOvertimeDuration =
          Math.floor(overtimeDuration / this.OVERTIME_INCREMENT_MINUTES) *
          this.OVERTIME_INCREMENT_MINUTES;
        return {
          status: 'overtime-ended',
          isOvertime: true,
          overtimeDuration: roundedOvertimeDuration,
          overtimeStartTime: shiftEnd,
        };
      } else {
        return {
          status: 'checked-out',
          isOvertime: false,
          overtimeDuration: 0,
          overtimeStartTime: null,
        };
      }
    } else if (now.isAfter(shiftEnd)) {
      return {
        status: 'overtime-ongoing',
        isOvertime: true,
        overtimeDuration: now.diff(shiftEnd, 'minutes'),
        overtimeStartTime: shiftEnd,
      };
    } else {
      return {
        status: 'checked-in',
        isOvertime: false,
        overtimeDuration: 0,
        overtimeStartTime: null,
      };
    }
  }

  private mapUserData(
    user: User & { assignedShift: Shift; department: { name: string } },
  ): UserData {
    return {
      id: user.id,
      lineUserId: user.lineUserId,
      name: user.name,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      employeeId: user.employeeId,
      role: user.role as UserRole,
      shiftId: user.shiftId,
      assignedShift: this.convertToShiftData(user.assignedShift),
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
  private convertToShiftData(shift: Shift): ShiftData {
    return {
      id: shift.id,
      shiftCode: shift.shiftCode,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays,
    };
  }

  async processExternalCheckInOut(
    externalCheckIn: ExternalCheckInData,
    userInfo: any,
    shift: ShiftData,
  ): Promise<Attendance> {
    logMessage(
      `Processing external check-in/out for user: ${userInfo.user_no}`,
    );
    const user = await prisma.user.findUnique({
      where: { employeeId: externalCheckIn.user_no.toString() },
    });
    if (!user) throw new Error('User not found');

    const checkTime = moment(externalCheckIn.sj).tz(this.TIMEZONE);
    const startOfDay = checkTime.clone().startOf('day');
    const endOfDay = startOfDay.clone().endOf('day');

    const attendanceRecord = await prisma.attendance.findFirst({
      where: {
        userId: user.id,
        date: {
          gte: startOfDay.toDate(),
          lt: endOfDay.toDate(),
        },
      },
    });

    const shiftEnd = this.getShiftEndTime(checkTime, shift);
    const isOvertime = this.isOvertime(checkTime, shiftEnd);
    const overtimeHours = isOvertime
      ? this.calculateOvertimeHours(checkTime, shiftEnd)
      : 0;

    if (!attendanceRecord) {
      return this.createAttendance(
        user.id,
        checkTime.toDate(),
        isOvertime,
        overtimeHours,
        externalCheckIn,
      );
    } else if (!attendanceRecord.checkOutTime) {
      return this.updateAttendance(
        attendanceRecord.id,
        checkTime.toDate(),
        isOvertime,
        overtimeHours,
        externalCheckIn,
      );
    } else {
      logMessage(
        `Duplicate check-in attempt for user ${user.id} on ${startOfDay.format('YYYY-MM-DD')}`,
      );
      return attendanceRecord;
    }
  }

  private async createAttendance(
    userId: string,
    checkTime: Date,
    isOvertime: boolean,
    overtimeHours: number,
    externalData: ExternalCheckInData,
  ): Promise<Attendance> {
    logMessage(`Creating new attendance record for user ${userId}`);
    return prisma.attendance.create({
      data: {
        userId,
        date: moment(checkTime).tz(this.TIMEZONE).startOf('day').toDate(),
        checkInTime: checkTime,
        status: isOvertime ? 'overtime-started' : 'checked-in',
        checkInLocation: JSON.stringify({ lat: 0, lng: 0 }),
        checkInDeviceSerial: externalData.dev_serial,
        isManualEntry: false,
      },
    });
  }

  private async updateAttendance(
    attendanceId: string,
    checkOutTime: Date,
    isOvertime: boolean,
    overtimeHours: number,
    externalData: ExternalCheckInData,
  ): Promise<Attendance> {
    logMessage(
      `Updating attendance record ${attendanceId} with check-out time`,
    );
    return prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkOutTime,
        status: isOvertime ? 'overtime-ended' : 'checked-out',
        checkOutLocation: JSON.stringify({ lat: 0, lng: 0 }),
        checkOutDeviceSerial: externalData.dev_serial,
      },
    });
  }

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    logMessage(`Processing attendance for user ${data.userId}`);
    const user = await prisma.user.findUnique({
      where: { id: data.userId }, // Fix: Use data.userId instead of user.id
      include: { assignedShift: true, department: true },
    });
    if (!user) throw new Error('User not found');

    const checkTime = moment(data.checkTime).tz(this.TIMEZONE);

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

      const todayStart = moment().tz(this.TIMEZONE).startOf('day');

      // Check for ongoing overtime from previous day
      const latestAttendance = await this.getLatestAttendanceRecord(
        await this.getInternalAttendances(user.id, todayStart.toDate()),
        [],
        user.assignedShift,
        user.employeeId,
      );

      if (
        latestAttendance &&
        latestAttendance.checkInTime &&
        moment(latestAttendance.checkInTime).isBefore(todayStart) &&
        latestAttendance.status === 'overtime-started'
      ) {
        attendanceType = 'overtime';
      }

      if (data.isCheckIn) {
        return await this.processCheckIn(
          user.id,
          checkTime.toDate(),
          attendanceType,
          {
            location: data.location,
            address: data.address,
            reason: data.reason,
            photo: data.photo ?? '',
            deviceSerial: data.deviceSerial,
            isLate: data.isLate,
          },
        );
      } else {
        return await this.processCheckOut(
          user.id,
          checkTime.toDate(),
          attendanceType,
          {
            location: data.location,
            address: data.address,
            reason: data.reason,
            photo: data.photo ?? '', // Add default value of an empty string
            deviceSerial: data.deviceSerial,
          },
        );
      }
    } catch (error: any) {
      logMessage(`Error processing attendance: ${error.message}`);
      await this.notificationService.sendNotification(
        user.id,
        `Error processing ${data.isCheckIn ? 'check-in' : 'check-out'}: ${error.message}`,
      );
      throw error;
    }
  }

  private async processCheckIn(
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
      isLate?: boolean;
    },
  ): Promise<Attendance> {
    logMessage(`Processing check-in for user ${userId}`);
    const user = await this.getUserWithShift(userId);
    if (!user) throw new Error('User not found');

    const { shift, shiftStart, shiftEnd } = await this.getEffectiveShift(
      user,
      checkInTime,
    );

    let status: AttendanceStatusType;
    let isOvertime = false;

    const twoHoursBeforeShift = moment(shiftStart).subtract(2, 'hours');

    if (moment(checkInTime).isBefore(twoHoursBeforeShift)) {
      logMessage('Check-in is more than 2 hours before shift start');
      await this.notificationService.sendNotification(
        userId,
        `Your check-in for ${moment(checkInTime).format('YYYY-MM-DD')} at ${moment(checkInTime).format('HH:mm:ss')} is more than 2 hours before your shift starts. This may not be counted as a valid attendance. Please check your schedule.`,
      );
      throw new Error('Check-in too early');
    }

    if (moment(checkInTime).isBefore(shiftStart)) {
      const yesterdayShiftEnd = moment(shiftEnd).subtract(1, 'day');
      if (moment(checkInTime).isAfter(yesterdayShiftEnd)) {
        status = 'overtime-started';
        isOvertime = true;
      } else {
        status = 'early-check-in';
      }
    } else if (moment(checkInTime).isAfter(shiftEnd)) {
      status = 'late-check-in';
    } else {
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
    }

    if (
      attendanceType === 'regular' &&
      moment(checkInTime).isBefore(shiftStart)
    ) {
      const overtimeRequest =
        await this.overtimeService.getApprovedOvertimeRequest(
          userId,
          checkInTime,
        );
      if (!overtimeRequest) {
        await this.notificationService.sendNotification(
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
        date: moment(checkInTime).tz(this.TIMEZONE).startOf('day').toDate(),
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

    await this.notificationService.sendNotification(
      userId,
      `Check-in recorded for ${moment(checkInTime).format('YYYY-MM-DD')} at ${moment(checkInTime).format('HH:mm:ss')} using ${getDeviceType(additionalData.deviceSerial)} (${status}).`,
    );

    return attendance;
  }

  private async processCheckOut(
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
    logMessage(`Processing check-out for user ${userId}`);
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

    let status: AttendanceStatusType;
    let isOvertime = latestAttendance.isOvertime;

    if (moment(checkOutTime).isAfter(shiftEnd)) {
      const nextDayShiftStart = moment(shiftStart).add(1, 'day');
      if (moment(checkOutTime).isBefore(nextDayShiftStart)) {
        status = 'overtime-ended';
        isOvertime = true;
      } else {
        status = 'late-check-out';
      }
    } else if (moment(checkOutTime).isBefore(shiftEnd)) {
      status = 'early-check-out';
    } else {
      switch (attendanceType) {
        case 'overtime':
          status = 'overtime-ended';
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
          status = 'checked-out';
      }
    }

    if (
      attendanceType === 'regular' &&
      moment(checkOutTime).isAfter(shiftEnd)
    ) {
      const overtimeRequest =
        await this.overtimeService.getApprovedOvertimeRequest(
          userId,
          checkOutTime,
        );
      if (!overtimeRequest) {
        await this.notificationService.sendNotification(
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

    await this.notificationService.sendNotification(
      userId,
      `Check-out recorded at ${moment(checkOutTime).format('HH:mm:ss')} (${status})`,
    );

    await this.handleUnapprovedOvertime(userId, checkOutTime);

    return updatedAttendance;
  }

  private async getEffectiveShift(
    user: User & { assignedShift: Shift },
    date: Date,
  ): Promise<{ shift: Shift; shiftStart: Date; shiftEnd: Date }> {
    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId: user.id,
        date: {
          equals: moment(date).tz(this.TIMEZONE).startOf('day').toDate(),
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

    const shiftStart = moment(date)
      .tz(this.TIMEZONE)
      .set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
    const shiftEnd = moment(date)
      .tz(this.TIMEZONE)
      .set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

    // Handle overnight shifts
    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    return {
      shift: effectiveShift,
      shiftStart: shiftStart.toDate(),
      shiftEnd: shiftEnd.toDate(),
    };
  }

  async handleUnapprovedOvertime(userId: string, checkOutTime: Date) {
    logMessage(`Handling unapproved overtime for user ${userId}`);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user) throw new Error('User not found');

    const effectiveShift = await this.getEffectiveShift(user, checkOutTime);
    if (!effectiveShift) throw new Error('Effective shift not found');

    const { shift, shiftStart, shiftEnd } = effectiveShift;

    // Handle overnight shifts
    const adjustedShiftEnd = moment(shiftEnd).isBefore(moment(shiftStart))
      ? moment(shiftEnd).add(1, 'day')
      : moment(shiftEnd);

    if (moment(checkOutTime).isAfter(adjustedShiftEnd)) {
      const overtimeMinutes = moment(checkOutTime).diff(
        adjustedShiftEnd,
        'minutes',
      );

      // Check if it's a holiday
      const checkDate = moment(checkOutTime).tz(this.TIMEZONE).startOf('day');
      const isHoliday = await this.holidayService.isHoliday(checkDate.toDate());
      const isShift104Holiday =
        user.assignedShift.shiftCode === 'SHIFT104' &&
        (await this.shift104HolidayService.isShift104Holiday(
          checkDate.toDate(),
        ));

      // Create time entry for overtime
      await prisma.timeEntry.create({
        data: {
          userId: user.id,
          date: checkDate.toDate(),
          startTime: adjustedShiftEnd.toDate(),
          endTime: checkOutTime,
          regularHours: 0,
          overtimeHours: overtimeMinutes / 60,
          status: 'unapproved-overtime',
        },
      });

      // Notify admin about unapproved overtime
      const admins = await prisma.user.findMany({
        where: {
          OR: [{ role: 'Admin' }, { role: 'SuperAdmin' }],
        },
      });

      for (const admin of admins) {
        await this.notificationService.sendNotification(
          admin.id,
          `Unapproved overtime detected for ${user.name} (${overtimeMinutes} minutes)` +
            (isHoliday || isShift104Holiday ? ' on a holiday.' : ''),
        );
      }

      // If the overtime extends to the next day, create an additional time entry
      const nextDayStart = moment(checkOutTime)
        .tz(this.TIMEZONE)
        .startOf('day')
        .add(1, 'day');
      if (moment(checkOutTime).isAfter(nextDayStart)) {
        const nextDayOvertimeMinutes = moment(checkOutTime).diff(
          nextDayStart,
          'minutes',
        );
        await prisma.timeEntry.create({
          data: {
            userId: user.id,
            date: nextDayStart.toDate(),
            startTime: nextDayStart.toDate(),
            endTime: checkOutTime,
            regularHours: 0,
            overtimeHours: nextDayOvertimeMinutes / 60,
            status: 'unapproved-overtime',
          },
        });
      }
    }
  }

  async getTodayCheckIn(userId: string): Promise<Attendance | null> {
    const today = moment().tz(this.TIMEZONE).startOf('day');
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
          .tz(this.TIMEZONE)
          .startOf('day')
          .toDate(),
        checkInTime: potentialCheckInTime,
        checkOutTime,
        status: 'PENDING_APPROVAL',
        checkInLocation: JSON.stringify({ lat: 0, lng: 0 }),
        checkOutLocation: JSON.stringify({ lat: 0, lng: 0 }),
      },
    });
  }

  async closeOpenAttendances() {
    logMessage('Closing open attendances');
    const fourHoursAgo = moment().subtract(4, 'hours');
    const openAttendances = await prisma.attendance.findMany({
      where: {
        checkOutTime: null,
        checkInTime: { lt: fourHoursAgo.toDate() },
      },
      include: { user: true },
    });

    for (const attendance of openAttendances) {
      const effectiveShift =
        await this.shiftManagementService.getEffectiveShift(
          attendance.user.id,
          attendance.date,
        );

      if (effectiveShift) {
        const { shiftEnd } = effectiveShift;
        const cutoffTime = moment(shiftEnd).add(4, 'hours');

        if (moment().isAfter(cutoffTime)) {
          await prisma.attendance.update({
            where: { id: attendance.id },
            data: {
              checkOutTime: shiftEnd,
              status: 'auto-checked-out',
              checkOutReason: 'Auto-closed after 4 hours from shift end',
            },
          });

          await this.notificationService.sendNotification(
            attendance.userId,
            `Your attendance for ${moment(attendance.date).format('YYYY-MM-DD')} was automatically closed.`,
          );
        }
      }
    }
  }

  private calculateShiftTimes(shift: ShiftData, date: Date) {
    const shiftStart = moment(date).set({
      hour: parseInt(shift.startTime.split(':')[0]),
      minute: parseInt(shift.startTime.split(':')[1]),
      second: 0,
      millisecond: 0,
    });
    const shiftEnd = moment(date).set({
      hour: parseInt(shift.endTime.split(':')[0]),
      minute: parseInt(shift.endTime.split(':')[1]),
      second: 0,
      millisecond: 0,
    });
    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    return {
      shiftStart,
      shiftEnd,
      flexibleStart: shiftStart.clone().subtract(30, 'minutes'),
      graceEnd: shiftStart.clone().add(5, 'minutes'),
      checkOutEnd: shiftEnd.clone().add(15, 'minutes'),
      lateCheckOutStart: shiftEnd.clone().add(15, 'minutes'),
      lateCheckOutEnd: shiftEnd.clone().add(30, 'minutes'),
    };
  }

  private async isValidAttendanceDay(
    userId: string,
    date: Date,
  ): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user || !user.assignedShift) {
      throw new Error('User or assigned shift not found');
    }

    const isWorkDay = await this.holidayService.isWorkingDay(userId, date);

    if (user.assignedShift.shiftCode === 'SHIFT104') {
      const isShift104Holiday =
        await this.shift104HolidayService.isShift104Holiday(date);
      return isWorkDay && !isShift104Holiday;
    }

    return isWorkDay;
  }
}

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
  ProcessedAttendance,
  ShiftData,
  ShiftAdjustment,
  ApprovedOvertime,
  AttendanceStatusType,
  UserData,
} from '../types/user';
import { UserRole } from '@/types/enum';
import moment from 'moment-timezone';
import { logMessage } from '../utils/inMemoryLogger';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class AttendanceService {
  private processingService = new AttendanceProcessingService();

  constructor(
    private externalDbService: ExternalDbService,
    private holidayService: HolidayService,
    private shift104HolidayService: Shift104HolidayService,
  ) {
    this.processingService = new AttendanceProcessingService();
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

      const userData = this.convertToUserData(user);

      console.log(
        `User found: ${user.id}, Assigned shift: ${user.assignedShift.id}`,
      );

      const shifts = await prisma.shift.findMany();
      const shiftsMap = new Map(
        shifts.map((shift) => [shift.id, shift as ShiftData]),
      );
      const threeDaysAgo = moment().subtract(3, 'days').startOf('day');
      console.log(
        `Fetching attendance data from ${threeDaysAgo.format()} to now`,
      );
      const now = moment();

      const [internalAttendances, externalAttendanceData] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            userId: user.id,
            date: { gte: threeDaysAgo.toDate() },
          },
          orderBy: { date: 'desc' },
        }),
        this.externalDbService.getDailyAttendanceRecords(employeeId, 3),
      ]);

      logMessage(
        `Internal attendances: ${JSON.stringify(internalAttendances, null, 2)}`,
      );
      logMessage(
        `External attendance data: ${JSON.stringify(externalAttendanceData, null, 2)}`,
      );

      const allRecords = [
        ...internalAttendances,
        ...externalAttendanceData.records.map((record) =>
          this.convertExternalToInternal(record),
        ),
      ].sort((a, b) => moment(b.checkInTime).diff(moment(a.checkInTime)));

      const processedAttendance = await this.processAttendanceData(
        allRecords.map((record) => this.ensureAttendanceRecord(record)),
        userData,
        threeDaysAgo.toDate(),
        now.toDate(),
        shiftsMap,
      );

      const latestAttendance = processedAttendance[0];
      logMessage(
        `Latest attendance: ${JSON.stringify(latestAttendance, null, 2)}`,
      );

      const isWorkDay = await this.holidayService.isWorkingDay(
        user.id,
        now.toDate(),
      );
      let isDayOff = !isWorkDay;

      console.log('Is work day:', isWorkDay);

      if (user.assignedShift.shiftCode === 'SHIFT104') {
        const isShift104Holiday =
          await this.shift104HolidayService.isShift104Holiday(now.toDate());
        if (isShift104Holiday) {
          isDayOff = true;
        }
      }

      const futureShifts = await this.getFutureShifts(user.id);
      const futureOvertimes = await this.getFutureOvertimes(user.id);

      const potentialOvertime = this.calculatePotentialOvertime(
        latestAttendance,
        user.assignedShift,
      );
      logMessage(
        `Calculated potential overtime: ${JSON.stringify(potentialOvertime)}`,
      );

      let isCheckingIn = true;
      if (latestAttendance && latestAttendance.checkOut) {
        const lastCheckOutTime = moment(latestAttendance.checkOut).tz(
          'Asia/Bangkok',
        );
        const currentTime = moment().tz('Asia/Bangkok');
        isCheckingIn = currentTime.diff(lastCheckOutTime, 'hours') >= 1;
      } else if (latestAttendance) {
        isCheckingIn = false;
      }

      const result: AttendanceStatus = {
        user: userData,
        latestAttendance: latestAttendance
          ? {
              id: latestAttendance.id,
              userId: latestAttendance.userId,
              date: latestAttendance.date.toISOString(),
              checkInTime: latestAttendance.checkIn?.toString() ?? null,
              checkOutTime: latestAttendance.checkOut?.toString() ?? null,
              checkInDeviceSerial: latestAttendance.checkInDeviceSerial ?? '',
              checkOutDeviceSerial:
                latestAttendance.checkOutDeviceSerial ?? null,
              status: latestAttendance.status as AttendanceStatusType,
              isManualEntry: latestAttendance.isManualEntry,
            }
          : null,
        isCheckingIn: isCheckingIn,
        isDayOff: isDayOff,
        potentialOvertime: potentialOvertime,
        shiftAdjustment: null,
        approvedOvertime: null,
        futureShifts,
        futureOvertimes,
      };

      logMessage(
        `Final latestAttendance in result: ${JSON.stringify(result.latestAttendance, null, 2)}`,
      );

      return result;
    } catch (error) {
      console.error('Error in getLatestAttendanceStatus:', error);
      throw error;
    }
  }

  async processAttendanceData(
    attendanceRecords: AttendanceRecord[],
    userData: UserData,
    startDate: Date,
    endDate: Date,
    shifts: Map<string, ShiftData>,
  ): Promise<ProcessedAttendance[]> {
    logMessage('Starting processAttendanceData');
    logMessage(`Input records: ${JSON.stringify(attendanceRecords, null, 2)}`);

    const shiftAdjustments = await this.getShiftAdjustments(
      userData.id,
      startDate,
      endDate,
    );
    const approvedOvertimes = await this.getApprovedOvertimes(
      userData.id,
      startDate,
      endDate,
    );
    const groupedRecords = this.groupRecordsByDate(
      attendanceRecords,
      userData,
      shiftAdjustments,
      shifts,
    );

    logMessage(`Grouped records: ${JSON.stringify(groupedRecords, null, 2)}`);

    const processedAttendance: ProcessedAttendance[] = [];
    const currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment)) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const records = groupedRecords[dateStr] || [];
      const effectiveShift = this.getEffectiveShift(
        currentDate,
        userData,
        shiftAdjustments,
        shifts,
      );
      const isWorkDay = effectiveShift.workDays.includes(currentDate.day());

      if (records.length === 0) {
        processedAttendance.push({
          date: currentDate.toDate(),
          status: isWorkDay ? 'absent' : 'off',
          checkIn: undefined,
          checkOut: undefined,
          isEarlyCheckIn: false,
          isLateCheckIn: false,
          isLateCheckOut: false,
          overtimeHours: 0,
          detailedStatus: isWorkDay ? 'absent' : 'day-off',
          id: '',
          userId: userData.id,
          isOvertime: false,
          overtimeDuration: 0,
          checkInDeviceSerial: null,
          checkOutDeviceSerial: null,
          isManualEntry: false,
        });
      } else {
        const pairedRecords = this.pairCheckInCheckOut(
          records,
          userData,
          shiftAdjustments,
          shifts,
        );

        for (const pair of pairedRecords) {
          const statusInfo = this.determineStatus(
            pair.checkIn,
            pair.checkOut,
            userData,
            shiftAdjustments,
            shifts,
            approvedOvertimes,
            isWorkDay,
          );
          const processedRecord = {
            date: currentDate.toDate(),
            status: statusInfo.status,
            checkIn: pair.checkIn.checkInTime
              ? pair.checkIn.checkInTime.toISOString()
              : undefined,
            checkOut: pair.checkOut?.checkOutTime
              ? pair.checkOut.checkOutTime.toISOString()
              : undefined,
            isEarlyCheckIn: statusInfo.isEarlyCheckIn,
            isLateCheckIn: statusInfo.isLateCheckIn,
            isLateCheckOut: statusInfo.isLateCheckOut,
            overtimeHours: statusInfo.overtimeDuration,
            detailedStatus: statusInfo.detailedStatus,
            id: pair.checkIn.id,
            userId: pair.checkIn.userId,
            isOvertime: statusInfo.isOvertime,
            overtimeDuration: statusInfo.overtimeDuration,
            checkInDeviceSerial: pair.checkIn.checkInDeviceSerial,
            checkOutDeviceSerial: pair.checkOut?.checkOutDeviceSerial || null,
            isManualEntry: pair.checkIn.isManualEntry,
          };
          processedAttendance.push(processedRecord);
          logMessage(
            `Processed record: ${JSON.stringify(processedRecord, null, 2)}`,
          );
        }
      }

      currentDate.add(1, 'day');
    }

    processedAttendance.sort((a, b) =>
      moment(b.checkIn || b.date).diff(moment(a.checkIn || a.date)),
    );

    logMessage(
      `Final processed attendance: ${JSON.stringify(processedAttendance, null, 2)}`,
    );

    return processedAttendance;
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

  private groupRecordsByDate(
    records: AttendanceRecord[],
    userData: UserData,
    shiftAdjustments: ShiftAdjustment[],
    shifts: Map<string, ShiftData>,
  ): Record<string, AttendanceRecord[]> {
    const recordsByDate: Record<string, AttendanceRecord[]> = {};

    records.forEach((record) => {
      const recordDate = moment(record.checkInTime);
      const effectiveShift = this.getEffectiveShift(
        recordDate,
        userData,
        shiftAdjustments,
        shifts,
      );
      const shiftStartHour = parseInt(effectiveShift.startTime.split(':')[0]);

      if (recordDate.hour() < shiftStartHour) {
        recordDate.subtract(1, 'day');
      }
      const dateKey = recordDate.format('YYYY-MM-DD');
      if (!recordsByDate[dateKey]) {
        recordsByDate[dateKey] = [];
      }
      recordsByDate[dateKey].push(record);
    });

    return recordsByDate;
  }

  private pairCheckInCheckOut(
    records: AttendanceRecord[],
    userData: UserData,
    shiftAdjustments: ShiftAdjustment[],
    shifts: Map<string, ShiftData>,
  ): Array<{ checkIn: AttendanceRecord; checkOut: AttendanceRecord | null }> {
    logMessage('Starting pairCheckInCheckOut');
    logMessage(`Input records: ${JSON.stringify(records, null, 2)}`);

    const pairs: Array<{
      checkIn: AttendanceRecord;
      checkOut: AttendanceRecord | null;
    }> = [];
    let currentCheckIn: AttendanceRecord | null = null;

    records.forEach((record, index) => {
      const recordDate = moment(record.date);
      const effectiveShift = this.getEffectiveShift(
        recordDate,
        userData,
        shiftAdjustments,
        shifts,
      );

      if (!currentCheckIn) {
        currentCheckIn = record;
      } else {
        const currentShiftEnd = moment(currentCheckIn.date).set({
          hour: parseInt(effectiveShift.endTime.split(':')[0]),
          minute: parseInt(effectiveShift.endTime.split(':')[1]),
        });

        if (currentShiftEnd.isBefore(moment(currentCheckIn.date))) {
          currentShiftEnd.add(1, 'day');
        }

        if (
          (record.checkInTime &&
            moment(record.checkInTime).isAfter(currentShiftEnd)) ||
          index === records.length - 1
        ) {
          pairs.push({
            checkIn: currentCheckIn,
            checkOut:
              record.checkInTime &&
              record.checkInTime <= currentShiftEnd.toDate()
                ? record
                : null,
          });
          currentCheckIn = record;
        }
      }
    });

    logMessage(`Paired records: ${JSON.stringify(pairs, null, 2)}`);
    return pairs;
  }

  private determineStatus(
    checkIn: AttendanceRecord,
    checkOut: AttendanceRecord | null,
    userData: UserData,
    shiftAdjustments: ShiftAdjustment[],
    shifts: Map<string, ShiftData>,
    approvedOvertimes: ApprovedOvertime[],
    isWorkDay: boolean,
  ): {
    status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off';
    isEarlyCheckIn: boolean;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    overtimeDuration: number;
    isOvertime: boolean;
    detailedStatus: string;
  } {
    let status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off' =
      'absent';
    let isEarlyCheckIn = false;
    let isLateCheckIn = false;
    let isLateCheckOut = false;
    let overtimeDuration = 0;
    let isOvertime = false;
    let detailedStatus = '';

    const checkInTime = checkIn.checkInTime
      ? moment(checkIn.checkInTime)
      : null;
    const checkOutTime = checkOut?.checkOutTime
      ? moment(checkOut.checkOutTime)
      : null;

    if (!isWorkDay) {
      status = 'off';
      if (checkInTime && checkOutTime) {
        overtimeDuration = this.calculateOvertimeDuration(
          checkInTime,
          checkOutTime,
          approvedOvertimes,
        );
        isOvertime = overtimeDuration > 0;
        detailedStatus = isOvertime ? 'overtime-on-day-off' : 'day-off';
      } else {
        detailedStatus = 'day-off';
      }
    } else {
      const currentDate = checkInTime || moment(); // Use current date if checkInTime is null
      const effectiveShift = this.getEffectiveShift(
        currentDate,
        userData,
        shiftAdjustments,
        shifts,
      );
      const shiftStart = currentDate.clone().set({
        hour: parseInt(effectiveShift.startTime.split(':')[0]),
        minute: parseInt(effectiveShift.startTime.split(':')[1]),
        second: 0,
      });
      const shiftEnd = currentDate.clone().set({
        hour: parseInt(effectiveShift.endTime.split(':')[0]),
        minute: parseInt(effectiveShift.endTime.split(':')[1]),
        second: 0,
      });

      if (shiftEnd.isBefore(shiftStart)) {
        shiftEnd.add(1, 'day');
      }

      const allowedCheckInStart = shiftStart.clone().subtract(15, 'minutes');
      const flexibleCheckInStart = allowedCheckInStart
        .clone()
        .subtract(15, 'minutes');
      const earlyCheckInThreshold = flexibleCheckInStart
        .clone()
        .subtract(1, 'minutes');
      const graceCheckInEnd = shiftStart.clone().add(5, 'minutes');

      const allowedCheckOutEnd = shiftEnd.clone().add(15, 'minutes');
      const flexibleCheckOutEnd = allowedCheckOutEnd.clone().add(14, 'minutes');
      const overtimeThreshold = flexibleCheckOutEnd.clone().add(1, 'minutes');
      const graceCheckOutStart = shiftEnd.clone().subtract(5, 'minutes');

      if (checkInTime) {
        if (checkInTime.isBefore(earlyCheckInThreshold)) {
          detailedStatus = 'early-check-in';
          isEarlyCheckIn = true;
        } else if (
          checkInTime.isBetween(flexibleCheckInStart, allowedCheckInStart)
        ) {
          detailedStatus = 'flexible-start';
        } else if (
          checkInTime.isBetween(allowedCheckInStart, graceCheckInEnd)
        ) {
          detailedStatus = 'on-time';
        } else {
          detailedStatus = 'late-check-in';
          isLateCheckIn = true;
        }

        if (checkOutTime) {
          status = 'present';
          if (checkOutTime.isBetween(graceCheckOutStart, allowedCheckOutEnd)) {
            detailedStatus += ' on-time-checkout';
          } else if (
            checkOutTime.isBetween(allowedCheckOutEnd, flexibleCheckOutEnd)
          ) {
            detailedStatus += ' flexible-end';
          } else if (checkOutTime.isAfter(overtimeThreshold)) {
            detailedStatus += ' overtime';
            isOvertime = true;
            isLateCheckOut = true;
            overtimeDuration = this.calculateOvertimeDuration(
              checkOutTime,
              overtimeThreshold,
              approvedOvertimes,
            );
          } else if (checkOutTime.isBefore(graceCheckOutStart)) {
            detailedStatus += ' early-checkout';
          }
        } else {
          status = 'incomplete';
          detailedStatus += ' no-checkout';
        }
      } else {
        status = 'absent';
        detailedStatus = 'no-check-in';
      }
    }

    return {
      status,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut,
      overtimeDuration,
      isOvertime,
      detailedStatus,
    };
  }

  private ensureAttendanceRecord(record: any): AttendanceRecord {
    return {
      id: record.id || record.bh?.toString() || '',
      userId: record.userId || record.user_serial?.toString() || '',
      date: record.date ? new Date(record.date) : new Date(),
      checkInTime: record.checkInTime
        ? new Date(record.checkInTime)
        : record.sj
          ? new Date(record.sj)
          : null,
      checkOutTime: record.checkOutTime ? new Date(record.checkOutTime) : null,
      isOvertime: record.isOvertime || false,
      isDayOff: record.isDayOff || false,
      overtimeStartTime: record.overtimeStartTime
        ? new Date(record.overtimeStartTime)
        : null,
      overtimeEndTime: record.overtimeEndTime
        ? new Date(record.overtimeEndTime)
        : null,
      checkInLocation: record.checkInLocation || null,
      checkOutLocation: record.checkOutLocation || null,
      checkInAddress: record.checkInAddress || null,
      checkOutAddress: record.checkOutAddress || null,
      checkInReason: record.checkInReason || null,
      checkOutReason: record.checkOutReason || null,
      checkInPhoto: record.checkInPhoto || null,
      checkOutPhoto: record.checkOutPhoto || null,
      checkInDeviceSerial:
        record.checkInDeviceSerial || record.dev_serial || null,
      checkOutDeviceSerial: record.checkOutDeviceSerial || null,
      status: record.status || 'checked-in',
      isManualEntry: record.isManualEntry || false,
    };
  }

  private convertExternalToInternal(
    external: ExternalCheckInData,
  ): AttendanceRecord {
    const checkInMoment = moment(external.sj);
    const recordDate = moment(external.date).startOf('day');
    return this.ensureAttendanceRecord({
      id: external.bh.toString(),
      userId: external.user_serial.toString(),
      date: recordDate.toDate(),
      checkInTime: checkInMoment.toDate(),
      checkOutTime: null,
      isOvertime: false,
      isDayOff: false,
      status: 'checked-in',
      checkInDeviceSerial: external.dev_serial,
    });
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
    const checkMoment = moment.tz(checkTime, 'Asia/Bangkok');
    const shiftDate = checkMoment.clone().startOf('day');
    const shiftStart = shiftDate.clone().set({
      hour: parseInt(shift.startTime.split(':')[0]),
      minute: parseInt(shift.startTime.split(':')[1]),
    });
    let shiftEnd = shiftDate.clone().set({
      hour: parseInt(shift.endTime.split(':')[0]),
      minute: parseInt(shift.endTime.split(':')[1]),
    });

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    const thirtyMinutesBeforeShift = shiftStart.clone().subtract(30, 'minutes');

    return (
      checkMoment.isBefore(thirtyMinutesBeforeShift) ||
      checkMoment.isAfter(shiftEnd)
    );
  }

  async getApprovedOvertimes(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ApprovedOvertime[]> {
    const overtimes = await prisma.overtimeRequest.findMany({
      where: {
        userId,
        status: 'approved',
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });

    return overtimes.map((ot) => ({
      id: ot.id,
      userId: ot.userId,
      date: ot.date,
      startTime: ot.startTime,
      endTime: ot.endTime,
      status: ot.status,
      reason: ot.reason,
      approvedBy: ot.approverId || '',
      approvedAt: ot.updatedAt,
    }));
  }

  async getShiftAdjustments(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ShiftAdjustment[]> {
    const adjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        userId,
        status: 'approved',
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return adjustments.map((adj) => ({
      date: adj.date.toISOString().split('T')[0], // Convert to YYYY-MM-DD string
      requestedShiftId: adj.requestedShiftId,
      requestedShift: adj.requestedShift as ShiftData,
    })) as ShiftAdjustment[];
  }

  private getEffectiveShift(
    date: moment.Moment,
    userData: UserData,
    shiftAdjustments: ShiftAdjustment[],
    shifts: Map<string, ShiftData>,
  ): ShiftData {
    const dateString = date.format('YYYY-MM-DD');
    const adjustment = shiftAdjustments.find((adj) => adj.date === dateString);

    if (adjustment) {
      return adjustment.requestedShift;
    }

    const userShift = shifts.get(userData.shiftId);
    if (!userShift) {
      throw new Error(`Shift not found for ID: ${userData.shiftId}`);
    }

    return userShift;
  }

  private calculateOvertimeDuration(
    checkInTime: moment.Moment,
    checkOutTime: moment.Moment,
    approvedOvertimes: ApprovedOvertime[],
  ): number {
    const approvedOvertime = approvedOvertimes.find(
      (ot) =>
        moment(ot.date).isSame(checkInTime, 'day') &&
        moment(ot.startTime).isSameOrBefore(checkOutTime) &&
        moment(ot.endTime).isSameOrAfter(checkInTime),
    );

    if (approvedOvertime) {
      const overtimeStart = moment.max(
        moment(approvedOvertime.startTime),
        checkInTime,
      );
      const overtimeEnd = moment.min(
        moment(approvedOvertime.endTime),
        checkOutTime,
      );
      return overtimeEnd.diff(overtimeStart, 'hours', true);
    }

    // If no approved overtime, calculate potential overtime
    const workDuration = checkOutTime.diff(checkInTime, 'hours', true);
    return Math.max(0, workDuration - 8); // Assuming 8 hours is a standard workday
  }

  private calculatePotentialOvertime(
    latestAttendance: ProcessedAttendance | null,
    assignedShift: ShiftData,
  ): { start: string; end: string } | null {
    if (!latestAttendance || !latestAttendance.checkOut) return null;

    const checkInTime = moment(latestAttendance.checkIn);
    const checkOutTime = moment(latestAttendance.checkOut);

    const shiftDate = checkInTime.clone().startOf('day');
    const shiftStart = shiftDate.clone().set({
      hour: parseInt(assignedShift.startTime.split(':')[0]),
      minute: parseInt(assignedShift.startTime.split(':')[1]),
    });
    let shiftEnd = shiftDate.clone().set({
      hour: parseInt(assignedShift.endTime.split(':')[0]),
      minute: parseInt(assignedShift.endTime.split(':')[1]),
    });

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    const allowedCheckInStart = shiftStart.clone().subtract(15, 'minutes');
    const flexibleCheckInStart = allowedCheckInStart
      .clone()
      .subtract(15, 'minutes');
    const allowedCheckOutEnd = shiftEnd.clone().add(15, 'minutes');
    const flexibleCheckOutEnd = allowedCheckOutEnd.clone().add(14, 'minutes');

    let overtimeStart = null;
    let overtimeEnd = null;

    if (checkInTime.isBefore(flexibleCheckInStart)) {
      overtimeStart = checkInTime.format('HH:mm');
    }

    if (checkOutTime.isAfter(flexibleCheckOutEnd)) {
      overtimeEnd = checkOutTime.format('HH:mm');
    }

    if (overtimeStart || overtimeEnd) {
      return {
        start: overtimeStart || shiftStart.format('HH:mm'),
        end: overtimeEnd || shiftEnd.format('HH:mm'),
      };
    }

    return null;
  }

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      include: { department: true },
    });
    if (!user) throw new Error('User not found');

    const userData: UserData = {
      ...user,
      role: user.role as UserRole,
      assignedShift: {
        id: '',
        shiftCode: '',
        name: '',
        startTime: '',
        endTime: '',
        workDays: [],
      },
      department: user.department.name,
    };

    const checkTime = moment(data.checkTime);

    try {
      const now = moment().tz('Asia/Bangkok');
      const todayStart = moment(now).startOf('day');

      const shiftAdjustments = await this.getShiftAdjustments(
        user.id,
        todayStart.toDate(),
        now.toDate(),
      );
      const shifts = await prisma.shift.findMany();
      const shiftsMap = new Map(
        shifts.map((shift) => [shift.id, shift as ShiftData]),
      );

      const effectiveShift = this.getEffectiveShift(
        checkTime,
        userData,
        shiftAdjustments,
        shiftsMap,
      );

      const shiftStart = checkTime.clone().set({
        hour: parseInt(effectiveShift.startTime.split(':')[0]),
        minute: parseInt(effectiveShift.startTime.split(':')[1]),
      });
      let shiftEnd = checkTime.clone().set({
        hour: parseInt(effectiveShift.endTime.split(':')[0]),
        minute: parseInt(effectiveShift.endTime.split(':')[1]),
      });

      if (shiftEnd.isBefore(shiftStart)) {
        shiftEnd.add(1, 'day');
      }

      const allowedCheckInStart = shiftStart.clone().subtract(15, 'minutes');
      const flexibleCheckInStart = allowedCheckInStart
        .clone()
        .subtract(15, 'minutes');
      const earlyCheckInThreshold = flexibleCheckInStart
        .clone()
        .subtract(1, 'minutes');
      const graceCheckInEnd = shiftStart.clone().add(5, 'minutes');

      const allowedCheckOutEnd = shiftEnd.clone().add(15, 'minutes');
      const flexibleCheckOutEnd = allowedCheckOutEnd.clone().add(14, 'minutes');
      const overtimeThreshold = flexibleCheckOutEnd.clone().add(1, 'minutes');
      const graceCheckOutStart = shiftEnd.clone().subtract(5, 'minutes');

      let attendanceType:
        | 'regular'
        | 'flexible-start'
        | 'flexible-end'
        | 'grace-period'
        | 'overtime' = 'regular';

      if (data.isCheckIn) {
        if (checkTime.isBefore(earlyCheckInThreshold)) {
          attendanceType = 'overtime';
        } else if (
          checkTime.isBetween(flexibleCheckInStart, allowedCheckInStart)
        ) {
          attendanceType = 'flexible-start';
        } else if (checkTime.isBetween(shiftStart, graceCheckInEnd)) {
          attendanceType = 'grace-period';
        }
      } else {
        if (checkTime.isAfter(overtimeThreshold)) {
          attendanceType = 'overtime';
        } else if (
          checkTime.isBetween(allowedCheckOutEnd, flexibleCheckOutEnd)
        ) {
          attendanceType = 'flexible-end';
        } else if (checkTime.isBetween(graceCheckOutStart, shiftEnd)) {
          attendanceType = 'grace-period';
        }
      }

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
        return await this.processingService.processCheckIn(
          user.id,
          checkTime.toDate(),
          attendanceType,
          {
            location: data.location,
            address: data.address,
            reason: data.reason,
            photo: data.photo,
            deviceSerial: data.deviceSerial,
            isLate:
              attendanceType === 'regular' &&
              checkTime.isAfter(graceCheckInEnd),
          },
        );
      } else {
        return await this.processingService.processCheckOut(
          user.id,
          checkTime.toDate(),
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

  private convertToUserData(user: any): UserData {
    return {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      role: user.role,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift,
      overtimeHours: user.overtimeHours,
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
  private async getFutureShifts(
    userId: string,
  ): Promise<Array<{ date: string; shift: ShiftData }>> {
    const tomorrow = moment().add(1, 'day').startOf('day');
    const twoWeeksLater = moment().add(2, 'weeks').endOf('day');

    const shiftAdjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        userId,
        status: 'approved',
        date: {
          gte: tomorrow.toDate(),
          lte: twoWeeksLater.toDate(),
        },
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return shiftAdjustments.map((adj) => ({
      date: adj.date.toISOString().split('T')[0],
      shift: adj.requestedShift,
    }));
  }

  private async getFutureOvertimes(
    userId: string,
  ): Promise<Array<ApprovedOvertime>> {
    const tomorrow = moment().add(1, 'day').startOf('day');
    const twoWeeksLater = moment().add(2, 'weeks').endOf('day');

    const overtimes = await prisma.overtimeRequest.findMany({
      where: {
        userId,
        status: 'approved',
        date: {
          gte: tomorrow.toDate(),
          lte: twoWeeksLater.toDate(),
        },
      },
      orderBy: { date: 'asc' },
    });

    return overtimes.map((ot) => ({
      id: ot.id,
      userId: ot.userId,
      date: ot.date,
      startTime: ot.startTime,
      endTime: ot.endTime,
      status: ot.status,
      reason: ot.reason,
      approvedBy: ot.approverId || '',
      approvedAt: ot.updatedAt,
    }));
  }
}

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
import { logMessage } from '../utils/inMemoryLogger';
import moment from 'moment-timezone';

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
    logMessage(
      `Getting latest attendance status for employee ID: ${employeeId}`,
    );

    if (!employeeId) {
      logMessage('Employee ID is required');
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
        logMessage(`User not found for employee ID: ${employeeId}`);
        throw new Error('User not found');
      }

      if (!user.assignedShift) {
        logMessage(`User has no assigned shift: ${employeeId}`);
        throw new Error('User has no assigned shift');
      }

      logMessage(
        `User found: ${user.id}, Assigned shift: ${user.assignedShift.id}`,
      );

      const threeDaysAgo = new Date(
        new Date().setDate(new Date().getDate() - 3),
      );
      logMessage(
        `Fetching attendance data from ${threeDaysAgo.toISOString()} to now`,
      );

      const [internalAttendances, externalAttendanceData] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            userId: user.id,
            date: { gte: threeDaysAgo },
          },
          orderBy: { date: 'desc' },
        }),
        this.externalDbService.getDailyAttendanceRecords(employeeId, 3),
      ]);

      logMessage(
        `Internal attendances: ${JSON.stringify(internalAttendances)}`,
      );
      logMessage(
        `External attendance data: ${JSON.stringify(externalAttendanceData)}`,
      );

      const latestAttendance = await this.getLatestAttendanceRecord(
        internalAttendances,
        externalAttendanceData.records,
        user.assignedShift as ShiftData,
        employeeId,
      );

      logMessage(
        `Latest attendance after getLatestAttendanceRecord: ${JSON.stringify(latestAttendance)}`,
      );

      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const shift = user.assignedShift;
      let shiftStart, shiftEnd;

      if (latestAttendance) {
        const shiftDate = new Date(latestAttendance.date);
        shiftStart = new Date(
          shiftDate.setHours(
            parseInt(shift.startTime.split(':')[0]),
            parseInt(shift.startTime.split(':')[1]),
            0,
            0,
          ),
        );
        shiftEnd = new Date(
          shiftDate.setHours(
            parseInt(shift.endTime.split(':')[0]),
            parseInt(shift.endTime.split(':')[1]),
            0,
            0,
          ),
        );

        if (shiftEnd < shiftStart) {
          shiftEnd.setDate(shiftEnd.getDate() + 1);
        }
      } else {
        const currentDate = new Date();
        shiftStart = new Date(
          currentDate.setHours(
            parseInt(shift.startTime.split(':')[0]),
            parseInt(shift.startTime.split(':')[1]),
            0,
            0,
          ),
        );
        shiftEnd = new Date(
          currentDate.setHours(
            parseInt(shift.endTime.split(':')[0]),
            parseInt(shift.endTime.split(':')[1]),
            0,
            0,
          ),
        );

        if (shiftEnd < shiftStart) {
          shiftEnd.setDate(shiftEnd.getDate() + 1);
        }
      }

      logMessage(`Shift start: ${shiftStart.toISOString()}`);
      logMessage(`Shift end: ${shiftEnd.toISOString()}`);

      const isWorkDay = await this.holidayService.isWorkingDay(user.id, today);
      logMessage(`Is work day: ${isWorkDay}`);
      let isDayOff = !isWorkDay;

      if (user.assignedShift.shiftCode === 'SHIFT104') {
        const isShift104Holiday =
          await this.shift104HolidayService.isShift104Holiday(today);
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
            gte: today,
            lt: new Date(today.setDate(today.getDate() + 1)),
          },
          status: 'approved',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      logMessage(`Approved overtime: ${JSON.stringify(approvedOvertime)}`);

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

      let potentialOvertime = null;
      if (
        latestAttendance &&
        latestAttendance.checkInTime &&
        latestAttendance.checkOutTime
      ) {
        const checkInTime = new Date(latestAttendance.checkInTime);
        const checkOutTime = new Date(latestAttendance.checkOutTime);

        logMessage('Potential overtime calculation:');
        logMessage(`Check-in time: ${checkInTime.toISOString()}`);
        logMessage(`Check-out time: ${checkOutTime.toISOString()}`);
        logMessage(`Shift start: ${shiftStart.toISOString()}`);
        logMessage(`Shift end: ${shiftEnd.toISOString()}`);

        const thirtyMinutesBeforeShift = new Date(
          shiftStart.getTime() - 30 * 60000,
        );

        if (checkInTime < thirtyMinutesBeforeShift || checkOutTime > shiftEnd) {
          potentialOvertime = {
            start:
              checkInTime < thirtyMinutesBeforeShift
                ? checkInTime.toTimeString().slice(0, 5)
                : shiftEnd.toTimeString().slice(0, 5),
            end: checkOutTime.toTimeString().slice(0, 5),
          };
        }
      }

      logMessage(
        `Calculated potential overtime: ${JSON.stringify(potentialOvertime)}`,
      );

      let isCheckingIn = true;
      if (latestAttendance && latestAttendance.checkOutTime) {
        const lastCheckOutTime = new Date(latestAttendance.checkOutTime);
        const currentTime = new Date();
        isCheckingIn =
          (currentTime.getTime() - lastCheckOutTime.getTime()) /
            (1000 * 60 * 60) >=
          1;
      } else if (latestAttendance) {
        isCheckingIn = false;
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

      logMessage(
        `Final latestAttendance in result: ${JSON.stringify(result.latestAttendance)}`,
      );

      return result;
    } catch (error) {
      logMessage(`Error in getLatestAttendanceStatus: ${error}`);
      throw error;
    }
  }

  private convertAttendanceToRecord(
    attendance: Attendance,
    employeeId: string,
  ): AttendanceRecord {
    return {
      ...attendance,
      employeeId,
      isOvertime: false,
      overtimeStartTime: null,
      overtimeEndTime: null,
      checkInLocation: attendance.checkInLocation
        ? JSON.parse(attendance.checkInLocation as string)
        : null,
      checkOutLocation: attendance.checkOutLocation
        ? JSON.parse(attendance.checkOutLocation as string)
        : null,
      status: attendance.status as AttendanceRecord['status'],
    };
  }

  private combineRecords(
    records: (Attendance | AttendanceRecord)[],
  ): AttendanceRecord {
    logMessage(
      `Combining records: ${JSON.stringify({ recordCount: records.length })}`,
    );

    const internalRecord = records.find(
      (r) => 'userId' in r && r.userId !== '',
    ) as Attendance | undefined;
    if (internalRecord) {
      logMessage(
        `Using internal record: ${JSON.stringify({ recordId: internalRecord.id })}`,
      );
      return this.convertAttendanceToRecord(
        internalRecord,
        internalRecord.userId,
      );
    }

    const firstRecord = records[0] as AttendanceRecord;
    const combined = records.reduce<AttendanceRecord>(
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
        ...firstRecord,
        employeeId: firstRecord.employeeId || 'unknown',
      },
    );

    logMessage(
      `Combined record: ${JSON.stringify({
        checkInTime: combined.checkInTime,
        checkOutTime: combined.checkOutTime,
        employeeId: combined.employeeId,
      })}`,
    );

    return combined;
  }

  private async getLatestAttendanceRecord(
    internalAttendances: Attendance[],
    externalRecords: ExternalCheckInData[],
    shift: ShiftData,
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    logMessage(
      `Starting getLatestAttendanceRecord: ${JSON.stringify({ employeeId })}`,
    );

    const convertedExternalRecords = externalRecords.map((record) =>
      this.convertExternalToInternal(record),
    );
    logMessage(
      `Converted external records: ${JSON.stringify({ count: convertedExternalRecords.length })}`,
    );

    const allRecords = [...internalAttendances, ...convertedExternalRecords];
    logMessage(`All records: ${JSON.stringify({ count: allRecords.length })}`);

    const groupedRecords = this.groupRecordsByDate(allRecords, shift);
    logMessage(
      `Grouped records: ${JSON.stringify({ dateCount: Object.keys(groupedRecords).length })}`,
    );

    const combinedRecords = Object.entries(groupedRecords).map(
      ([date, records]) => {
        logMessage(
          `Combining records for date: ${JSON.stringify({ date, recordCount: records.length })}`,
        );
        return this.combineRecords(records);
      },
    );

    const sortedRecords = combinedRecords.sort(
      (a, b) => b.date.getTime() - a.date.getTime(),
    );
    logMessage(
      `Sorted records: ${JSON.stringify({ count: sortedRecords.length })}`,
    );
    const latestRecord = sortedRecords[0] || null;
    logMessage(
      `Latest record: ${
        latestRecord
          ? JSON.stringify({
              id: latestRecord.id,
              date: latestRecord.date,
              checkInTime: latestRecord.checkInTime,
              checkOutTime: latestRecord.checkOutTime,
            })
          : 'No record found'
      }`,
    );

    return latestRecord;
  }

  private convertExternalToInternal(
    external: ExternalCheckInData,
  ): AttendanceRecord {
    const bangkokTime = moment.tz(
      `${external.date.split('T')[0]} ${external.time}`,
      'YYYY-MM-DD HH:mm:ss',
      'Asia/Bangkok',
    );

    // Adjust the date if the time is before 6 AM (assuming night shift)
    if (bangkokTime.hour() < 6) {
      bangkokTime.subtract(1, 'day');
    }

    const converted: AttendanceRecord = {
      id: external.bh.toString(),
      userId: '',
      employeeId: external.user_no,
      date: bangkokTime.startOf('day').toDate(),
      checkInTime: bangkokTime.toDate(),
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

    logMessage(
      `Converted external record: ${JSON.stringify({
        id: converted.id,
        date: converted.date,
        checkInTime: converted.checkInTime,
      })}`,
    );

    return converted;
  }

  private groupRecordsByDate(
    records: (Attendance | AttendanceRecord)[],
    shift: ShiftData,
  ): Record<string, (Attendance | AttendanceRecord)[]> {
    const recordsByDate: Record<string, (Attendance | AttendanceRecord)[]> = {};
    const shiftStartHour = parseInt(shift.startTime.split(':')[0]);

    records.forEach((record) => {
      if (record.checkInTime) {
        let recordDate = moment(record.checkInTime).tz('Asia/Bangkok');
        if (recordDate.hour() < shiftStartHour) {
          recordDate.subtract(1, 'day');
        }
        const dateKey = `${recordDate.format('YYYY-MM-DD')}-${(record as AttendanceRecord).employeeId || (record as Attendance).userId}`;
        if (!recordsByDate[dateKey]) {
          recordsByDate[dateKey] = [];
        }
        recordsByDate[dateKey].push(record);
      }
    });

    logMessage(
      `Grouped records by date: ${JSON.stringify({ dateCount: Object.keys(recordsByDate).length })}`,
    );

    return recordsByDate;
  }

  private determineStatus(
    record: AttendanceRecord,
    shift: ShiftData,
  ): {
    status: string;
    isOvertime: boolean;
    overtimeDuration: number;
    overtimeStartTime: Date | null;
  } {
    logMessage(`Determining status for record: ${JSON.stringify(record)}`);
    logMessage(`Shift: ${JSON.stringify(shift)}`);

    const checkInTime = record.checkInTime
      ? new Date(record.checkInTime)
      : null;
    const checkOutTime = record.checkOutTime
      ? new Date(record.checkOutTime)
      : null;

    if (!checkInTime) {
      logMessage('No check-in time available');
      return {
        status: 'unknown',
        isOvertime: false,
        overtimeDuration: 0,
        overtimeStartTime: null,
      };
    }

    const [shiftStartHour, shiftStartMinute] = shift.startTime
      .split(':')
      .map(Number);
    const [shiftEndHour, shiftEndMinute] = shift.endTime.split(':').map(Number);

    const shiftStart = new Date(checkInTime);
    shiftStart.setHours(shiftStartHour, shiftStartMinute, 0, 0);

    let shiftEnd = new Date(checkInTime);
    shiftEnd.setHours(shiftEndHour, shiftEndMinute, 0, 0);

    // Handle overnight shift
    if (shiftEnd < shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    logMessage(`Check-in time: ${checkInTime.toISOString()}`);
    logMessage(`Check-out time: ${checkOutTime?.toISOString()}`);
    logMessage(`Shift start: ${shiftStart.toISOString()}`);
    logMessage(`Shift end: ${shiftEnd.toISOString()}`);

    let status: string;
    let isOvertime = false;
    let overtimeDuration = 0;
    let overtimeStartTime: Date | null = null;

    if (!checkOutTime) {
      status = 'checked-in';
    } else if (checkOutTime > shiftEnd) {
      status = 'overtime-ended';
      isOvertime = true;
      overtimeDuration = Math.round(
        (checkOutTime.getTime() - shiftEnd.getTime()) / (1000 * 60),
      );
      overtimeStartTime = shiftEnd;
    } else if (checkInTime < shiftStart) {
      status = 'early-check-in';
      isOvertime = true;
      overtimeDuration = Math.round(
        (shiftStart.getTime() - checkInTime.getTime()) / (1000 * 60),
      );
      overtimeStartTime = checkInTime;
    } else {
      status = 'checked-out';
    }

    logMessage(`Determined status: ${status}`);
    logMessage(`Is overtime: ${isOvertime}`);
    logMessage(`Overtime duration: ${overtimeDuration} minutes`);
    logMessage(`Overtime start time: ${overtimeStartTime?.toISOString()}`);

    return { status, isOvertime, overtimeDuration, overtimeStartTime };
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

  private async getInternalAttendanceRecord(
    userId: string,
  ): Promise<AttendanceRecord | null> {
    const attendance = await prisma.attendance.findFirst({
      where: { userId },
      orderBy: { date: 'desc' },
    });
    return attendance as AttendanceRecord | null;
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

      const now = new Date();
      const todayStart = new Date(now.setHours(0, 0, 0, 0));

      // Check for ongoing overtime from previous day
      const latestAttendance = await this.getInternalAttendanceRecord(user.id);
      if (
        latestAttendance &&
        latestAttendance.checkInTime &&
        latestAttendance.checkInTime < todayStart &&
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
      logMessage(`Error processing attendance: ${error.message}`);
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

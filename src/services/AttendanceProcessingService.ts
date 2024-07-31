// AttendanceProcessingService.ts

import { PrismaClient, Attendance, User, Shift } from '@prisma/client';
import { NotificationService } from './NotificationService';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { ApprovedOvertime, AttendanceStatusType } from '../types/user';
import { getDeviceType } from '../utils/deviceUtils';
import { ShiftManagementService } from './ShiftManagementService';
import moment from 'moment-timezone';
import { HolidayService } from './HolidayService';
import { Shift104HolidayService } from './Shift104HolidayService';
import {
  differenceInMinutes,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
  addDays,
} from 'date-fns';

const shiftManagementService = new ShiftManagementService();
const prisma = new PrismaClient();
const overtimeService = new OvertimeServiceServer();
const notificationService = new NotificationService();

export class AttendanceProcessingService {
  private holidayService: HolidayService;
  private shift104HolidayService: Shift104HolidayService;
  private readonly TIMEZONE = 'Asia/Bangkok';
  private readonly GRACE_PERIOD_MINUTES = 30;
  private readonly MAX_OVERTIME_MINUTES = 24 * 60; // 24 hours
  private readonly OVERTIME_INCREMENT_MINUTES = 30;

  constructor() {
    this.holidayService = new HolidayService();
    this.shift104HolidayService = new Shift104HolidayService();
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

  async processCheckIn(
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
    const isValidDay = await this.isValidAttendanceDay(userId, checkInTime);
    if (!isValidDay) {
      throw new Error('Invalid attendance day');
    }
    const user = await this.getUserWithShift(userId);
    if (!user) throw new Error('User not found');

    const { shift, shiftStart, shiftEnd } = await this.getEffectiveShift(
      user,
      checkInTime,
    );
    console.log(`Shift: ${shift.name}`);
    console.log(`Shift start: ${shiftStart.toISOString()}`);
    console.log(`Shift end: ${shiftEnd.toISOString()}`);
    console.log(`Check-in time: ${checkInTime.toISOString()}`);

    let status: string;
    let isOvertime = false;

    const twoHoursBeforeShift = new Date(
      shiftStart.getTime() - 2 * 60 * 60 * 1000,
    );
    console.log(`Two hours before shift: ${twoHoursBeforeShift.toISOString()}`);

    if (checkInTime < twoHoursBeforeShift) {
      console.log('Check-in is more than 2 hours before shift start');
      await notificationService.sendNotification(
        userId,
        `Your check-in for ${checkInTime.toDateString()} at ${checkInTime.toTimeString()} is more than 2 hours before your shift starts. This may not be counted as a valid attendance. Please check your schedule.`,
      );
      throw new Error('Check-in too early');
    }

    if (checkInTime < shiftStart) {
      const yesterdayShiftEnd = new Date(shiftEnd);
      yesterdayShiftEnd.setDate(yesterdayShiftEnd.getDate() - 1);
      if (checkInTime > yesterdayShiftEnd) {
        status = 'overtime-started';
        isOvertime = true;
      } else {
        status = 'early-check-in';
      }
    } else if (checkInTime > shiftEnd) {
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

    if (attendanceType === 'regular' && checkInTime < shiftStart) {
      const overtimeRequest = await this.getApprovedOvertimeRequest(
        userId,
        checkInTime,
      );
      if (!overtimeRequest) {
        await notificationService.sendNotification(
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
        date: new Date(
          checkInTime.getFullYear(),
          checkInTime.getMonth(),
          checkInTime.getDate(),
        ),
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

    await notificationService.sendNotification(
      userId,
      `Check-in recorded for ${checkInTime.toDateString()} at ${checkInTime.toTimeString()} using ${getDeviceType(additionalData.deviceSerial)} (${status}).`,
    );

    return attendance;
  }

  async processCheckOut(
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
    const isValidDay = await this.isValidAttendanceDay(userId, checkOutTime);
    if (!isValidDay) {
      throw new Error('Invalid attendance day');
    }
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
    console.log(shift);

    let status: string;
    let isOvertime = latestAttendance.isOvertime;

    if (checkOutTime > shiftEnd) {
      const nextDayShiftStart = new Date(shiftStart);
      nextDayShiftStart.setDate(nextDayShiftStart.getDate() + 1);
      if (checkOutTime < nextDayShiftStart) {
        status = 'overtime-ended';
        isOvertime = true;
      } else {
        status = 'late-check-out';
      }
    } else if (checkOutTime < shiftEnd) {
      status = 'early-check-out';
    } else {
      switch (attendanceType) {
        case 'overtime':
          status = 'overtime-ended';
          isOvertime = true;
          break;
        case 'flexible-start':
          status = 'flexible-start-ended';
          break;
        case 'flexible-end':
          status = 'flexible-end-ended';
          break;
        case 'grace-period':
          status = 'grace-period-ended';
          break;
        default:
          status = 'checked-out';
      }
    }

    if (attendanceType === 'regular' && checkOutTime > shiftEnd) {
      const overtimeRequest = await this.getApprovedOvertimeRequest(
        userId,
        checkOutTime,
      );
      if (!overtimeRequest) {
        await notificationService.sendNotification(
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

    await notificationService.sendNotification(
      userId,
      `Check-out recorded at ${checkOutTime.toLocaleTimeString()} (${status})`,
    );

    return updatedAttendance;
  }

  private async getUserWithShift(
    userId: string,
  ): Promise<User & { assignedShift: Shift }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user) throw new Error('User not found');
    return user;
  }

  private async getEffectiveShift(
    user: User & { assignedShift: Shift },
    date: Date,
  ): Promise<{ shift: Shift; shiftStart: Date; shiftEnd: Date }> {
    const shiftAdjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        userId: user.id,
        date: {
          equals: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
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

    const shiftStart = new Date(date);
    shiftStart.setHours(startHour, startMinute, 0, 0);

    const shiftEnd = new Date(date);
    shiftEnd.setHours(endHour, endMinute, 0, 0);

    // Handle overnight shifts
    if (shiftEnd <= shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    return { shift: effectiveShift, shiftStart, shiftEnd };
  }

  private async getApprovedOvertimeRequest(
    userId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    return overtimeService.getApprovedOvertimeRequest(userId, date);
  }
  async closeOpenAttendances() {
    const fourHoursAgo = moment().subtract(4, 'hours');
    const openAttendances = await prisma.attendance.findMany({
      where: {
        checkOutTime: null,
        checkInTime: { lt: fourHoursAgo.toDate() },
      },
      include: { user: true },
    });

    for (const attendance of openAttendances) {
      const effectiveShift = await shiftManagementService.getEffectiveShift(
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
        }
      }
    }
  }

  async handleUnapprovedOvertime(userId: string, checkOutTime: Date) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });

    if (!user) throw new Error('User not found');

    const effectiveShift = await shiftManagementService.getEffectiveShift(
      userId,
      checkOutTime,
    );
    if (!effectiveShift) throw new Error('Effective shift not found');

    const { shift, shiftStart, shiftEnd } = effectiveShift;

    // Handle overnight shifts
    const adjustedShiftEnd = isBefore(shiftEnd, shiftStart)
      ? addDays(shiftEnd, 1)
      : shiftEnd;

    if (isAfter(checkOutTime, adjustedShiftEnd)) {
      const overtimeMinutes = differenceInMinutes(
        checkOutTime,
        adjustedShiftEnd,
      );

      // Check if it's a holiday
      const checkDate = startOfDay(checkOutTime);
      const isHoliday = await this.holidayService.isHoliday(checkDate);
      const isShift104Holiday =
        user.assignedShift.shiftCode === 'SHIFT104' &&
        (await this.shift104HolidayService.isShift104Holiday(checkDate));

      // Create time entry for overtime
      await prisma.timeEntry.create({
        data: {
          userId: user.id,
          date: startOfDay(checkOutTime),
          startTime: adjustedShiftEnd,
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
        await notificationService.sendNotification(
          admin.id,
          `Unapproved overtime detected for ${user.name} (${overtimeMinutes} minutes)` +
            (isHoliday || isShift104Holiday ? ' on a holiday.' : ''),
        );
      }

      // If the overtime extends to the next day, create an additional time entry
      const nextDayStart = endOfDay(checkOutTime);
      if (isAfter(checkOutTime, nextDayStart)) {
        const nextDayOvertimeMinutes = differenceInMinutes(
          checkOutTime,
          nextDayStart,
        );
        await prisma.timeEntry.create({
          data: {
            userId: user.id,
            date: startOfDay(nextDayStart),
            startTime: nextDayStart,
            endTime: checkOutTime,
            regularHours: 0,
            overtimeHours: nextDayOvertimeMinutes / 60,
            status: 'unapproved-overtime',
          },
        });
      }
    }
  }

  private determineCheckTimes(
    internalAttendance: any,
    externalAttendance: any,
    shift: any,
  ): { checkInTime: moment.Moment; checkOutTime: moment.Moment | null } {
    let checkInTime: moment.Moment;
    let checkOutTime: moment.Moment | null = null;

    if (internalAttendance?.checkInTime) {
      checkInTime = moment(internalAttendance.checkInTime).tz(this.TIMEZONE);
    } else if (externalAttendance?.sj) {
      checkInTime = moment(externalAttendance.sj).tz(this.TIMEZONE);
    } else {
      // If no check-in time is found, use the shift start time as a fallback
      const dateToUse =
        internalAttendance?.date || externalAttendance?.date || moment();
      checkInTime = moment.tz(dateToUse, this.TIMEZONE).set({
        hour: parseInt(shift.startTime.split(':')[0]),
        minute: parseInt(shift.startTime.split(':')[1]),
        second: 0,
        millisecond: 0,
      });
      console.warn(
        'No check-in time found. Using shift start time as fallback.',
      );
    }

    if (internalAttendance?.checkOutTime) {
      checkOutTime = moment(internalAttendance.checkOutTime).tz(this.TIMEZONE);
    }

    return { checkInTime, checkOutTime };
  }

  private calculateShiftTimes(
    date: moment.Moment,
    shift: any,
  ): { shiftStart: moment.Moment; shiftEnd: moment.Moment } {
    const shiftStart = moment(date)
      .tz(this.TIMEZONE)
      .set({
        hour: parseInt(shift.startTime.split(':')[0]),
        minute: parseInt(shift.startTime.split(':')[1]),
        second: 0,
        millisecond: 0,
      });

    const shiftEnd = moment(date)
      .tz(this.TIMEZONE)
      .set({
        hour: parseInt(shift.endTime.split(':')[0]),
        minute: parseInt(shift.endTime.split(':')[1]),
        second: 0,
        millisecond: 0,
      });

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    return { shiftStart, shiftEnd };
  }

  private calculateOvertimeDuration(
    checkInTime: moment.Moment,
    checkOutTime: moment.Moment | null,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
  ): number {
    let overtimeDuration = 0;
    const earlyOvertimeThreshold = moment(shiftStart).subtract(
      this.OVERTIME_INCREMENT_MINUTES,
      'minutes',
    );

    if (checkInTime.isBefore(earlyOvertimeThreshold)) {
      overtimeDuration += shiftStart.diff(checkInTime, 'minutes');
    }

    if (checkOutTime && checkOutTime.isAfter(shiftEnd)) {
      overtimeDuration += checkOutTime.diff(shiftEnd, 'minutes');
    }

    // Round up to the nearest 30-minute increment
    overtimeDuration =
      Math.ceil(overtimeDuration / this.OVERTIME_INCREMENT_MINUTES) *
      this.OVERTIME_INCREMENT_MINUTES;

    return overtimeDuration;
  }

  private determineStatus(
    checkInTime: moment.Moment,
    checkOutTime: moment.Moment | null,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
  ): {
    status: AttendanceStatusType;
    isOvertime: boolean;
    overtimeDuration: number;
    overtimeStartTime: moment.Moment | null;
  } {
    let status: AttendanceStatusType = 'checked-in';
    let isOvertime = false;
    let overtimeDuration = 0;
    let overtimeStartTime: moment.Moment | null = null;

    const earlyOvertimeThreshold = moment(shiftStart).subtract(
      this.OVERTIME_INCREMENT_MINUTES,
      'minutes',
    );

    if (checkOutTime) {
      if (checkOutTime.isAfter(shiftEnd)) {
        isOvertime = true;
        overtimeStartTime = moment(shiftEnd);
        overtimeDuration = checkOutTime.diff(shiftEnd, 'minutes');
        overtimeDuration =
          Math.floor(overtimeDuration / this.OVERTIME_INCREMENT_MINUTES) *
          this.OVERTIME_INCREMENT_MINUTES;
        status = overtimeDuration > 0 ? 'overtime-ended' : 'checked-out';
      } else {
        status = 'checked-out';
      }
    } else if (checkInTime.isAfter(shiftEnd)) {
      status = 'overtime-started';
      isOvertime = true;
      overtimeStartTime = checkInTime;
    }

    return { status, isOvertime, overtimeDuration, overtimeStartTime };
  }

  public async processAttendance(
    internalAttendance: any,
    externalAttendance: any,
    shift: any,
    overtimeRequests: any[],
  ) {
    const debugSteps = [];

    debugSteps.push({
      step: 'Raw Data',
      internalAttendance,
      externalAttendance,
      shift,
      overtimeRequests,
    });

    const { checkInTime, checkOutTime } = this.determineCheckTimes(
      internalAttendance,
      externalAttendance,
      shift,
    );
    const { shiftStart, shiftEnd } = this.calculateShiftTimes(
      checkInTime,
      shift,
    );

    debugSteps.push({
      step: 'Processed Times',
      checkInTime: checkInTime.format(),
      checkOutTime: checkOutTime?.format() || 'Not available',
      shiftStart: shiftStart.format(),
      shiftEnd: shiftEnd.format(),
    });

    const { status, isOvertime, overtimeDuration, overtimeStartTime } =
      this.determineStatus(checkInTime, checkOutTime, shiftStart, shiftEnd);
    debugSteps.push({
      step: 'Status Determination',
      status,
      isOvertime,
      overtimeDuration,
      overtimeStartTime,
    });

    const isApprovedOvertime = this.checkApprovedOvertime(
      checkInTime,
      overtimeRequests,
    );
    debugSteps.push({ step: 'Overtime Approval', isApprovedOvertime });

    return {
      checkInTime,
      checkOutTime,
      status,
      isOvertime,
      overtimeDuration,
      overtimeStartTime,
      isApprovedOvertime,
      debugSteps,
    };
  }

  private calculatePotentialOvertime(
    checkInTime: moment.Moment,
    checkOutTime: moment.Moment | null,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
    approvedOvertime: any | null,
  ): { start: string; end: string } | null {
    let potentialStart: moment.Moment | null = null;
    let potentialEnd: moment.Moment | null = null;

    if (checkInTime.isBefore(shiftStart)) {
      potentialStart = checkInTime;
    }

    if (checkOutTime && checkOutTime.isAfter(shiftEnd)) {
      potentialEnd = checkOutTime;
    }

    if (potentialStart || potentialEnd) {
      // Check if there's no approved overtime for this period
      if (
        !approvedOvertime ||
        (potentialStart &&
          moment(approvedOvertime.startTime).isAfter(potentialStart)) ||
        (potentialEnd &&
          moment(approvedOvertime.endTime).isBefore(potentialEnd))
      ) {
        return {
          start: potentialStart
            ? potentialStart.format('HH:mm')
            : shiftStart.format('HH:mm'),
          end: potentialEnd
            ? potentialEnd.format('HH:mm')
            : shiftEnd.format('HH:mm'),
        };
      }
    }

    return null;
  }

  private checkApprovedOvertime(
    checkTime: moment.Moment,
    overtimeRequests: any[],
  ): boolean {
    return overtimeRequests.some(
      (request) =>
        request.status === 'approved' &&
        checkTime.isBetween(
          moment(request.startTime),
          moment(request.endTime),
          null,
          '[]',
        ),
    );
  }
}

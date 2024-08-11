import { PrismaClient, Attendance } from '@prisma/client';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { ExternalDbService } from './ExternalDbService';
import { NotificationService } from './NotificationService';
import { HolidayService } from './HolidayService';
import { parseDateSafely } from '../utils/dateUtils';
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
  PotentialOvertime,
  ManualEntryData,
} from '../types/user';
import { UserRole } from '../types/enum';
import moment from 'moment-timezone';
import { logMessage } from '../utils/inMemoryLogger';
import { ILeaveServiceServer } from '@/types/LeaveService';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class AttendanceService {
  private processingService: AttendanceProcessingService;

  constructor(
    private externalDbService: ExternalDbService,
    private holidayService: HolidayService,
    private shift104HolidayService: Shift104HolidayService,
    private leaveServiceServer: ILeaveServiceServer,
  ) {
    this.processingService = new AttendanceProcessingService();
    logMessage('AttendanceService initialized');
  }

  private parseDateSafely(
    dateString: string,
    format: string,
  ): moment.Moment | null {
    const parsedDate = moment.tz(dateString, format, 'Asia/Bangkok');
    if (!parsedDate.isValid()) {
      logMessage(`Invalid date encountered: ${dateString}, Format: ${format}`);
      return null;
    }
    return parsedDate;
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatus> {
    logMessage(
      `Getting latest attendance status for employee ID: ${employeeId}`,
    );

    if (!employeeId) {
      throw new Error('Employee ID is required');
    }

    try {
      const user = await this.getUser(employeeId);
      const userData = this.convertToUserData(user);

      const yesterday = moment().subtract(1, 'days').startOf('day');
      const now = moment();

      const [internalAttendances, externalAttendanceData] = await Promise.all([
        this.getInternalAttendances(employeeId, yesterday.toDate()),
        this.externalDbService.getDailyAttendanceRecords(employeeId, 2),
      ]);

      const mergedAttendances = this.mergeAttendances(
        internalAttendances,
        externalAttendanceData.records,
      );
      const processedAttendances = await this.processAttendanceData(
        mergedAttendances,
        userData,
        yesterday.toDate(),
        now.toDate(),
      );
      const shiftAdjustments = await this.getShiftAdjustments(
        employeeId,
        yesterday.toDate(),
        now.toDate(),
      );
      const shifts = await this.getAllShifts();
      const shift = this.getEffectiveShift(
        now,
        userData,
        shiftAdjustments,
        shifts,
      );
      const isDayOff = await this.isDayOff(employeeId, now.toDate(), shift);
      const latestAttendance = this.getLatestAttendance(
        processedAttendances,
        now,
      );
      const isCheckingIn = this.determineIfCheckingIn(latestAttendance);

      const futureShifts = await this.getFutureShifts(userData.employeeId);
      const futureOvertimes = await this.getFutureOvertimes(
        userData.employeeId,
      );
      const potentialOvertimes = await this.getPotentialOvertimes(
        employeeId,
        now.toDate(),
      );
      const shiftAdjustment = await this.getLatestShiftAdjustment(
        employeeId,
        now.toDate(),
      );
      const approvedOvertime = await this.getApprovedOvertime(
        employeeId,
        now.toDate(),
      );

      const result = this.createAttendanceStatus(
        userData,
        latestAttendance,
        isCheckingIn,
        isDayOff,
        potentialOvertimes,
        shiftAdjustment,
        approvedOvertime,
        futureShifts,
        futureOvertimes,
      );
      logMessage(
        `Final latestAttendance in result: ${JSON.stringify(result.latestAttendance, null, 2)}`,
      );

      return result;
    } catch (error) {
      console.error('Error in getLatestAttendanceStatus:', error);
      throw error;
    }
  }

  private async getUser(employeeId: string) {
    logMessage(`Fetching user data for employee ID: ${employeeId}`);
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: {
        assignedShift: true,
        department: true,
        potentialOvertimes: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.assignedShift) {
      throw new Error('User has no assigned shift');
    }

    return this.convertToUserData(user);
  }

  private async getInternalAttendances(
    employeeId: string,
    startDate: Date,
  ): Promise<Attendance[]> {
    return prisma.attendance.findMany({
      where: {
        employeeId,
        date: { gte: startDate },
      },
      orderBy: { date: 'desc' },
    });
  }

  private mergeAttendances(
    internal: Attendance[],
    external: ExternalCheckInData[],
  ): AttendanceRecord[] {
    logMessage(
      `Merging ${internal.length} internal and ${external.length} external attendance records`,
    );
    const allAttendances = [
      ...internal.map(this.convertInternalToAttendanceRecord),
      ...external
        .map(this.convertExternalToAttendanceRecord)
        .filter((record): record is AttendanceRecord => record !== undefined),
    ];

    return allAttendances.sort((a, b) =>
      a && b ? moment(b.attendanceTime).diff(moment(a.attendanceTime)) : 0,
    );
  }

  async processAttendanceData(
    attendanceRecords: AttendanceRecord[],
    user: UserData,
    startDate: Date,
    endDate: Date,
  ): Promise<ProcessedAttendance[]> {
    logMessage(
      `Processing attendance data for user ${user.employeeId} from ${startDate} to ${endDate}`,
    );
    const shiftAdjustments = await this.getShiftAdjustments(
      user.employeeId,
      startDate,
      endDate,
    );
    const approvedOvertimes = await this.getApprovedOvertimes(
      user.employeeId,
      startDate,
      endDate,
    );
    const leaveRequest = await this.leaveServiceServer.getLeaveRequests(
      user.employeeId,
    );
    const shifts = await this.getAllShifts();

    const groupedRecords = this.groupRecordsByDate(
      attendanceRecords,
      user,
      shiftAdjustments,
      shifts,
    );

    const processedAttendance: ProcessedAttendance[] = [];
    const currentDate = moment(startDate);

    while (currentDate.isSameOrBefore(moment(endDate), 'day')) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const records = groupedRecords[dateStr] || [];
      const effectiveShift = this.getEffectiveShift(
        currentDate,
        user,
        shiftAdjustments,
        shifts,
      );
      const isDayOff = await this.isDayOff(
        user.employeeId,
        currentDate.toDate(),
        effectiveShift,
      );
      const isLeave = leaveRequest.some(
        (leave: {
          startDate: moment.MomentInput;
          endDate: moment.MomentInput;
        }) =>
          moment(leave.startDate).isSameOrBefore(currentDate, 'day') &&
          moment(leave.endDate).isSameOrAfter(currentDate, 'day'),
      );

      if (records.length === 0 && !isDayOff && !isLeave) {
        processedAttendance.push(
          this.createAbsentRecord(currentDate.toDate(), user.employeeId, true),
        );
      } else if (isLeave) {
        processedAttendance.push(
          this.createLeaveRecord(currentDate.toDate(), user.employeeId),
        );
      } else {
        const pairedRecords = this.pairCheckInCheckOut(records);
        for (const pair of pairedRecords) {
          const processedRecord = await this.processAttendanceRecord(
            pair.checkIn,
            pair.checkOut,
            effectiveShift,
            !isDayOff,
            approvedOvertimes,
          );
          processedAttendance.push(processedRecord);
        }
      }

      currentDate.add(1, 'day');
    }
    for (const record of attendanceRecords) {
      const recordDate = this.parseDateSafely(
        record.date.toISOString(),
        moment.ISO_8601.toString(),
      );
      if (!recordDate) {
        logMessage(
          `Invalid date in attendance record: ${JSON.stringify(record)}`,
        );
        continue;
      }
    }

    return this.validateAndCorrectAttendance(processedAttendance);
  }

  private pairCheckInCheckOut(records: AttendanceRecord[]): Array<{
    checkIn: AttendanceRecord;
    checkOut: AttendanceRecord | undefined;
  }> {
    const paired: Array<{
      checkIn: AttendanceRecord;
      checkOut: AttendanceRecord | undefined;
    }> = [];
    for (let i = 0; i < records.length; i += 2) {
      const checkIn = records[i];
      const checkOut = records[i + 1];
      paired.push({
        checkIn,
        checkOut:
          checkOut &&
          moment(checkOut.attendanceTime).isAfter(checkIn.attendanceTime)
            ? checkOut
            : undefined,
      });
    }
    return paired;
  }

  public async processAttendanceRecord(
    checkIn: AttendanceRecord,
    checkOut: AttendanceRecord | undefined,
    shift: ShiftData,
    isWorkDay: boolean,
    approvedOvertimes: ApprovedOvertime[],
  ): Promise<ProcessedAttendance> {
    const checkInTime = moment(checkIn.checkInTime);
    const checkOutTime = checkOut ? moment(checkOut.checkOutTime) : null;
    const shiftStart = moment(checkIn.date).set({
      hour: parseInt(shift.startTime.split(':')[0]),
      minute: parseInt(shift.startTime.split(':')[1]),
    });
    const shiftEnd = moment(checkIn.date).set({
      hour: parseInt(shift.endTime.split(':')[0]),
      minute: parseInt(shift.endTime.split(':')[1]),
    });
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, 'day');

    let status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off' =
      'present';
    const isEarlyCheckIn = checkInTime.isBefore(
      shiftStart.clone().subtract(30, 'minutes'),
    );
    const isLateCheckIn = checkInTime.isAfter(
      shiftStart.clone().add(15, 'minutes'),
    );
    const isLateCheckOut = checkOutTime
      ? checkOutTime.isAfter(shiftEnd.clone().add(15, 'minutes'))
      : undefined;

    let regularHours = 0;
    let overtimeInfo = {
      duration: 0,
      periods: [] as { start: string; end: string }[],
    };

    if (!isWorkDay) {
      status = 'off';
    } else if (!checkOutTime) {
      status = 'incomplete';
    } else {
      regularHours = this.calculateRegularHours(
        checkInTime,
        checkOutTime,
        shiftStart,
        shiftEnd,
      );
      overtimeInfo = this.calculateOvertime(
        checkInTime,
        checkOutTime,
        shiftStart,
        shiftEnd,
        approvedOvertimes,
      );
    }

    return {
      id: checkIn.id,
      employeeId: checkIn.employeeId,
      date: checkIn.date,
      checkIn: checkInTime.format(),
      checkOut: checkOutTime ? checkOutTime.format() : undefined,
      status,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut,
      regularHours,
      overtimeHours: overtimeInfo.duration,
      overtimeDuration: overtimeInfo.duration,
      potentialOvertimePeriods: overtimeInfo.periods,
      isOvertime: overtimeInfo.duration > 0,
      detailedStatus: this.generateDetailedStatus(
        status,
        isEarlyCheckIn,
        isLateCheckIn,
        isLateCheckOut ?? false,
      ),
      checkInDeviceSerial: checkIn.checkInDeviceSerial,
      checkOutDeviceSerial: checkOut?.checkOutDeviceSerial ?? null,
      isManualEntry:
        checkIn.isManualEntry || (checkOut?.isManualEntry ?? false),
    };
  }

  private calculateRegularHours(
    checkIn: moment.Moment,
    checkOut: moment.Moment,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
  ): number {
    const effectiveStart = moment.max(checkIn, shiftStart);
    const effectiveEnd = moment.min(checkOut, shiftEnd);
    return Math.max(0, effectiveEnd.diff(effectiveStart, 'hours', true));
  }

  private calculateOvertime(
    checkIn: moment.Moment,
    checkOut: moment.Moment,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
    approvedOvertimes: ApprovedOvertime[],
  ): { duration: number; periods: { start: string; end: string }[] } {
    let overtimeDuration = 0;
    const periods: { start: string; end: string }[] = [];

    // Early check-in
    if (checkIn.isBefore(shiftStart)) {
      const earlyMinutes = shiftStart.diff(checkIn, 'minutes');
      const roundedEarlyMinutes = Math.floor(earlyMinutes / 30) * 30;
      if (roundedEarlyMinutes > 0) {
        overtimeDuration += roundedEarlyMinutes;
        periods.push({
          start: checkIn.format('HH:mm'),
          end: shiftStart.format('HH:mm'),
        });
      }
    }

    // Late check-out
    if (checkOut.isAfter(shiftEnd)) {
      const lateMinutes = checkOut.diff(shiftEnd, 'minutes');
      const roundedLateMinutes = Math.ceil(lateMinutes / 30) * 30;
      if (roundedLateMinutes > 0) {
        overtimeDuration += roundedLateMinutes;
        periods.push({
          start: shiftEnd.format('HH:mm'),
          end: checkOut.format('HH:mm'),
        });
      }
    }

    // Check if overtime is approved
    const isApproved = approvedOvertimes.some(
      (overtime) =>
        moment(overtime.date).isSame(checkIn, 'day') &&
        moment(overtime.startTime).isSameOrBefore(checkIn) &&
        moment(overtime.endTime).isSameOrAfter(checkOut),
    );

    return {
      duration: isApproved ? overtimeDuration / 60 : 0,
      periods: isApproved ? periods : [],
    };
  }

  private generateDetailedStatus(
    status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off',
    isEarlyCheckIn: boolean,
    isLateCheckIn: boolean,
    isLateCheckOut: boolean,
  ): string {
    if (status !== 'present') return status;

    const details: string[] = [];
    if (isEarlyCheckIn) details.push('early-check-in');
    if (isLateCheckIn) details.push('late-check-in');
    if (isLateCheckOut) details.push('late-check-out');

    return details.length > 0 ? details.join('-') : 'on-time';
  }

  private groupRecordsByDate(
    records: AttendanceRecord[],
    userData: UserData,
    shiftAdjustments: ShiftAdjustment[],
    shifts: Map<string, ShiftData>,
  ): Record<string, AttendanceRecord[]> {
    const recordsByDate: Record<string, AttendanceRecord[]> = {};

    records.forEach((record) => {
      const recordDate = moment(record.attendanceTime).tz('Asia/Bangkok');
      const effectiveShift = this.getEffectiveShift(
        recordDate,
        userData,
        shiftAdjustments,
        shifts,
      );
      const shiftStartHour = parseInt(effectiveShift.startTime.split(':')[0]);

      // If the attendance time is before the shift start hour, it belongs to the previous day's shift
      if (recordDate.hour() < shiftStartHour) {
        recordDate.subtract(1, 'day');
      }

      const dateKey = recordDate.format('YYYY-MM-DD');
      if (!recordsByDate[dateKey]) {
        recordsByDate[dateKey] = [];
      }
      recordsByDate[dateKey].push(record);
    });

    // Sort records for each day
    Object.keys(recordsByDate).forEach((date) => {
      recordsByDate[date].sort((a, b) =>
        moment(a.attendanceTime).diff(moment(b.attendanceTime)),
      );
    });

    logMessage(
      `Records grouped by date: ${JSON.stringify(recordsByDate, null, 2)}`,
    );

    return recordsByDate;
  }

  private async isDayOff(
    employeeId: string,
    date: Date,
    shift: ShiftData,
  ): Promise<boolean> {
    const momentDate = moment(date).tz('Asia/Bangkok');
    const dayOfWeek = momentDate.day();
    logMessage(
      `Checking day off for ${momentDate.format('YYYY-MM-DD')}, day of week: ${dayOfWeek}, shift work days: ${shift.workDays}`,
    );

    if (!shift.workDays.includes(dayOfWeek)) {
      logMessage(
        `${momentDate.format('YYYY-MM-DD')} is a day off (not in work days)`,
      );
      return true;
    }

    const isHoliday = await this.holidayService.isHoliday(date);
    if (isHoliday) {
      logMessage(`${momentDate.format('YYYY-MM-DD')} is a holiday`);
      return true;
    }

    const isShift104 = shift.shiftCode === 'SHIFT104';
    if (isShift104) {
      const isShift104Holiday =
        await this.shift104HolidayService.isShift104Holiday(date);
      if (isShift104Holiday) {
        logMessage(`${momentDate.format('YYYY-MM-DD')} is a Shift104 holiday`);
        return true;
      }
    }

    const weeklyWorkDayCount = await this.getWeeklyWorkDayCount(
      employeeId,
      date,
    );
    const isDayOff = weeklyWorkDayCount >= 6;
    logMessage(
      `${momentDate.format('YYYY-MM-DD')} weekly work day count: ${weeklyWorkDayCount}, is day off: ${isDayOff}`,
    );
    return isDayOff;
  }

  private async getWeeklyWorkDayCount(
    employeeId: string,
    date: Date,
  ): Promise<number> {
    const startOfWeek = moment(date).tz('Asia/Bangkok').startOf('week');
    const endOfWeek = moment(date).tz('Asia/Bangkok').endOf('week');

    const attendances = await prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfWeek.toDate(),
          lte: endOfWeek.toDate(),
        },
        status: 'present',
      },
    });

    const holidays = await this.holidayService.getHolidays(
      startOfWeek.toDate(),
      endOfWeek.toDate(),
    );
    const isShift104 = await this.isUserShift104(employeeId);

    let workDayCount = attendances.length;

    for (const holiday of holidays) {
      if (isShift104) {
        const isShift104Holiday =
          await this.shift104HolidayService.isShift104Holiday(holiday.date);
        if (isShift104Holiday) workDayCount--;
      } else {
        workDayCount--;
      }
    }

    return workDayCount;
  }

  private calculateOvertimeHours(
    start: Date,
    end: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): number {
    let overtimeHours = 0;
    if (start < shiftStart) {
      overtimeHours +=
        (shiftStart.getTime() - start.getTime()) / (1000 * 60 * 60);
    }
    if (end > shiftEnd) {
      overtimeHours += (end.getTime() - shiftEnd.getTime()) / (1000 * 60 * 60);
    }
    return overtimeHours;
  }

  private combineDateAndTime(date: Date, time: string): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  }

  private calculatePotentialOvertime(
    checkInTime: moment.Moment,
    checkOutTime: moment.Moment,
    shift: ShiftData,
  ): { duration: number; periods: { start: string; end: string }[] } {
    const shiftStart = moment(shift.startTime, 'HH:mm');
    const shiftEnd = moment(shift.endTime, 'HH:mm');
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, 'day');

    let overtimeDuration = 0;
    const periods: { start: string; end: string }[] = [];

    // Early check-in
    if (checkInTime.isBefore(shiftStart)) {
      const earlyMinutes = shiftStart.diff(checkInTime, 'minutes');
      const roundedEarlyMinutes = Math.floor(earlyMinutes / 30) * 30;
      if (roundedEarlyMinutes > 0) {
        overtimeDuration += roundedEarlyMinutes;
        periods.push({
          start: checkInTime.format('HH:mm'),
          end: shiftStart.format('HH:mm'),
        });
      }
    }

    // Late check-out
    if (checkOutTime.isAfter(shiftEnd)) {
      const lateMinutes = checkOutTime.diff(shiftEnd, 'minutes');
      const roundedLateMinutes = Math.ceil(lateMinutes / 30) * 30;
      if (roundedLateMinutes > 0) {
        overtimeDuration += roundedLateMinutes;
        periods.push({
          start: shiftEnd.format('HH:mm'),
          end: checkOutTime.format('HH:mm'),
        });
      }
    }

    return { duration: overtimeDuration / 60, periods };
  }

  private convertPotentialOvertime(po: any): PotentialOvertime {
    return {
      id: po.id,
      employeeId: po.employeeId,
      date: po.date,
      hours: po.hours,
      type: po.type as 'early-check-in' | 'late-check-out' | 'day-off',
      status: po.status as 'pending' | 'approved' | 'rejected',
      periods: po.periods ? JSON.parse(po.periods as string) : undefined,
      reviewedBy: po.reviewedBy ?? undefined,
      reviewedAt: po.reviewedAt ?? undefined,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
    };
  }

  async getSummaryStatistics(
    processedAttendance: ProcessedAttendance[],
  ): Promise<{
    totalWorkingDays: number;
    totalPresent: number;
    totalAbsent: number;
    totalLeave: number;
    totalIncomplete: number;
    totalOvertimeHours: number;
    totalRegularHours: number;
  }> {
    return processedAttendance.reduce(
      (acc, record) => {
        acc.totalWorkingDays++;
        if (record.status === 'present') acc.totalPresent++;
        if (record.status === 'absent') acc.totalAbsent++;
        if (record.status === 'off') acc.totalLeave++;
        if (record.status === 'incomplete') acc.totalIncomplete++;
        acc.totalOvertimeHours += record.overtimeHours ?? 0;
        acc.totalRegularHours += record.regularHours;
        return acc;
      },
      {
        totalWorkingDays: 0,
        totalPresent: 0,
        totalAbsent: 0,
        totalLeave: 0,
        totalIncomplete: 0,
        totalOvertimeHours: 0,
        totalRegularHours: 0,
      },
    );
  }

  private async flagPotentialOvertime(
    processedAttendance: ProcessedAttendance,
  ): Promise<void> {
    if (processedAttendance.overtimeHours ?? 0 > 0) {
      await prisma.potentialOvertime.create({
        data: {
          employeeId: processedAttendance.employeeId,
          date: processedAttendance.date,
          hours: processedAttendance.overtimeHours || 0,
          type: this.determineOvertimeType(processedAttendance),
          status: 'pending',
          periods: JSON.stringify(processedAttendance.potentialOvertimePeriods),
        },
      });

      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await notificationService.sendNotification(
          admin.id,
          `Potential overtime detected for ${processedAttendance.employeeId} on ${processedAttendance.date.toDateString()}. Please review.`,
        );
      }
    }
  }

  private determineOvertimeType(
    attendance: ProcessedAttendance,
  ): 'early-check-in' | 'late-check-out' | 'day-off' {
    if (attendance.isEarlyCheckIn) return 'early-check-in';
    if (attendance.isLateCheckOut) return 'late-check-out';
    return 'day-off';
  }

  private createAttendanceStatus(
    userData: UserData,
    latestAttendance: ProcessedAttendance,
    isCheckingIn: boolean,
    isDayOff: boolean,
    potentialOvertimes: PotentialOvertime[],
    shiftAdjustment: ShiftAdjustment | null,
    approvedOvertime: ApprovedOvertime | null,
    futureShifts: Array<{ date: string; shift: ShiftData }>,
    futureOvertimes: Array<ApprovedOvertime>,
  ): AttendanceStatus {
    return {
      user: userData,
      latestAttendance: latestAttendance
        ? {
            id: latestAttendance.id,
            employeeId: latestAttendance.employeeId,
            date: latestAttendance.date.toISOString(),
            checkInTime: latestAttendance.checkIn?.toString() ?? null,
            checkOutTime: latestAttendance.checkOut?.toString() ?? null,
            checkInDeviceSerial: latestAttendance.checkInDeviceSerial ?? '',
            checkOutDeviceSerial: latestAttendance.checkOutDeviceSerial ?? null,
            status: latestAttendance.status as AttendanceStatusType,
            isManualEntry: latestAttendance.isManualEntry,
          }
        : null,
      isCheckingIn,
      isDayOff,
      potentialOvertimes: potentialOvertimes,
      shiftAdjustment,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      status: latestAttendance.status,
      isOvertime: latestAttendance.isOvertime,
      overtimeDuration: latestAttendance.overtimeHours,
      detailedStatus: latestAttendance.detailedStatus,
      isEarlyCheckIn: latestAttendance.isEarlyCheckIn,
      isLateCheckIn: latestAttendance.isLateCheckIn,
      isLateCheckOut: latestAttendance.isLateCheckOut,
    };
  }

  private getLatestAttendance(
    processedAttendances: ProcessedAttendance[],
    now: moment.Moment,
  ): ProcessedAttendance {
    const todayAttendance = processedAttendances.find((a) =>
      moment(a.date).isSame(now, 'day'),
    );
    if (todayAttendance) return todayAttendance;

    const yesterdayAttendance = processedAttendances.find((a) =>
      moment(a.date).isSame(now.clone().subtract(1, 'day'), 'day'),
    );
    if (yesterdayAttendance && !yesterdayAttendance.checkOut)
      return yesterdayAttendance;

    return this.createAbsentRecord(
      now.toDate(),
      processedAttendances[0].employeeId,
      true,
    );
  }

  private determineIfCheckingIn(
    latestAttendance: ProcessedAttendance,
  ): boolean {
    if (!latestAttendance.checkOut) return false;
    const lastCheckOutTime = moment(latestAttendance.checkOut);
    const currentTime = moment();
    return currentTime.diff(lastCheckOutTime, 'hours') >= 1;
  }

  // Additional methods

  async getTodayCheckIn(employeeId: string): Promise<Attendance | null> {
    const today = moment().tz('Asia/Bangkok').startOf('day');
    return prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: today.toDate(),
          lt: today.add(1, 'day').toDate(),
        },
        checkInTime: { not: null },
      },
    });
  }

  async createPendingAttendance(
    employeeId: string,
    potentialCheckInTime: Date,
    checkOutTime: Date,
  ): Promise<Attendance> {
    return prisma.attendance.create({
      data: {
        employeeId,
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

  async getAttendanceHistory(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    return prisma.attendance.findMany({
      where: {
        employeeId,
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

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    logMessage(`Processing attendance for employee ID: ${data.employeeId}`);
    const user = await this.getUser(data.employeeId);
    const checkTime = moment(data.checkTime);

    try {
      const now = moment().tz('Asia/Bangkok');
      const todayStart = moment(now).startOf('day');

      const shiftAdjustments = await this.getShiftAdjustments(
        user.employeeId,
        todayStart.toDate(),
        now.toDate(),
      );
      const shifts = await this.getAllShifts(); // Add this line

      const effectiveShift = this.getEffectiveShift(
        checkTime,
        user,
        shiftAdjustments,
        shifts,
      );
      logMessage(
        `Effective shift for ${data.employeeId}: ${JSON.stringify(effectiveShift)}`,
      );

      const attendanceType = this.determineAttendanceType(
        checkTime,
        effectiveShift,
        data.isCheckIn,
      );

      if (data.isCheckIn) {
        return await this.processingService.processCheckIn(
          user.employeeId,
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
              checkTime.isAfter(
                moment(effectiveShift.startTime, 'HH:mm').add(15, 'minutes'),
              ),
          },
        );
      } else {
        const latestAttendance = await this.getLatestOpenAttendance(
          user.employeeId,
        );
        if (!latestAttendance) {
          throw new Error('No open attendance record found for check-out');
        }
        return await this.processingService.processCheckOut(
          latestAttendance.id,
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
        user.employeeId,
        `Error processing ${data.isCheckIn ? 'check-in' : 'check-out'}: ${error.message}`,
      );
      throw error;
    }
  }

  private determineAttendanceType(
    checkTime: moment.Moment,
    shift: ShiftData,
    isCheckIn: boolean,
  ):
    | 'regular'
    | 'flexible-start'
    | 'flexible-end'
    | 'grace-period'
    | 'overtime' {
    const shiftStart = moment(shift.startTime, 'HH:mm');
    const shiftEnd = moment(shift.endTime, 'HH:mm');
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, 'day');

    const flexibleStartTime = shiftStart.clone().subtract(30, 'minutes');
    const graceEndTime = shiftStart.clone().add(15, 'minutes');
    const flexibleEndTime = shiftEnd.clone().add(30, 'minutes');

    if (isCheckIn) {
      if (checkTime.isBefore(flexibleStartTime)) return 'overtime';
      if (checkTime.isBetween(flexibleStartTime, shiftStart))
        return 'flexible-start';
      if (checkTime.isBetween(shiftStart, graceEndTime)) return 'grace-period';
      return 'regular';
    } else {
      if (checkTime.isAfter(flexibleEndTime)) return 'overtime';
      if (checkTime.isBetween(shiftEnd, flexibleEndTime)) return 'flexible-end';
      return 'regular';
    }
  }

  async getHistoricalAttendance(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ProcessedAttendance[]> {
    logMessage(
      `Fetching historical attendance for ${employeeId} from ${startDate} to ${endDate}`,
    );
    const user = await this.getUser(employeeId);
    const userData = this.convertToUserData(user);

    const { records: externalRecords, totalCount } =
      await this.externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate,
        endDate,
      );

    const attendanceRecords = externalRecords
      .map(this.convertExternalToAttendanceRecord)
      .filter((record) => record !== undefined) as AttendanceRecord[];

    return this.processAttendanceData(
      attendanceRecords,
      userData,
      startDate,
      endDate,
    );
  }

  async requestManualEntry(data: ManualEntryData): Promise<Attendance> {
    logMessage(
      `Processing manual entry request for ${data.employeeId} on ${data.date}`,
    );
    const user = await this.getUser(data.employeeId);

    const manualEntry = await prisma.attendance.create({
      data: {
        employeeId: user.employeeId,
        date: new Date(data.date),
        checkInTime: new Date(data.checkInTime),
        checkOutTime: new Date(data.checkOutTime),
        status: 'pending',
        isManualEntry: true,
        checkInReason: data.reason,
        checkOutReason: data.reason,
      },
    });

    await notificationService.sendNotification(
      user.employeeId,
      `Manual entry created for ${data.date}. Please wait for admin approval.`,
    );

    return manualEntry;
  }

  async approveManualEntry(
    attendanceId: string,
    adminId: string,
  ): Promise<Attendance> {
    logMessage(`Approving manual entry ${attendanceId} by admin ${adminId}`);
    const attendance = await prisma.attendance.findUnique({
      where: { id: attendanceId },
    });
    if (!attendance) throw new Error('Attendance record not found');
    if (!attendance.isManualEntry)
      throw new Error('This is not a manual entry');

    const approvedAttendance = await prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: 'approved',
        checkOutReason: `Approved by admin ${adminId}`,
      },
    });

    await notificationService.sendNotification(
      attendance.employeeId,
      `Your manual entry for ${attendance.date.toDateString()} has been approved.`,
    );

    return approvedAttendance;
  }

  private async getLatestOpenAttendance(
    employeeId: string,
  ): Promise<Attendance | null> {
    return prisma.attendance.findFirst({
      where: {
        employeeId,
        checkOutTime: null,
      },
      orderBy: { checkInTime: 'desc' },
    });
  }

  private async getShiftAdjustments(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ShiftAdjustment[]> {
    logMessage(
      `Fetching shift adjustments for ${employeeId} from ${startDate} to ${endDate}`,
    );
    const adjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
        status: 'approved',
        date: { gte: startDate, lte: endDate },
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return adjustments.map((adj) => ({
      date: adj.date.toISOString().split('T')[0],
      requestedShiftId: adj.requestedShiftId,
      requestedShift: adj.requestedShift as ShiftData,
      status: adj.status as 'pending' | 'approved' | 'rejected',
      reason: adj.reason,
      createdAt: adj.createdAt,
      updatedAt: adj.updatedAt,
    }));
  }

  private async getApprovedOvertimes(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ApprovedOvertime[]> {
    logMessage(
      `Fetching approved overtimes for ${employeeId} from ${startDate} to ${endDate}`,
    );
    const overtimes = await prisma.overtimeRequest.findMany({
      where: {
        employeeId,
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
      employeeId: ot.employeeId,
      date: ot.date,
      startTime: ot.startTime,
      endTime: ot.endTime,
      status: ot.status,
      reason: ot.reason,
      approvedBy: ot.approverId || '',
      approvedAt: ot.updatedAt,
    }));
  }

  private async getFutureShifts(
    employeeId: string,
  ): Promise<Array<{ date: string; shift: ShiftData }>> {
    const tomorrow = moment().add(1, 'day').startOf('day');
    const twoWeeksLater = moment().add(2, 'weeks').endOf('day');

    const shiftAdjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
        status: 'approved',
        date: { gte: tomorrow.toDate(), lte: twoWeeksLater.toDate() },
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return shiftAdjustments.map((adj) => ({
      date: adj.date.toISOString().split('T')[0],
      shift: adj.requestedShift as ShiftData,
    }));
  }

  private async getFutureOvertimes(
    employeeId: string,
  ): Promise<ApprovedOvertime[]> {
    const tomorrow = moment().add(1, 'day').startOf('day');
    const twoWeeksLater = moment().add(2, 'weeks').endOf('day');

    return this.getApprovedOvertimes(
      employeeId,
      tomorrow.toDate(),
      twoWeeksLater.toDate(),
    );
  }

  private async getPotentialOvertimes(
    employeeId: string,
    date: Date,
  ): Promise<PotentialOvertime[]> {
    const potentialOvertimes = await prisma.potentialOvertime.findMany({
      where: {
        employeeId,
        date: {
          gte: moment(date).startOf('day').toDate(),
          lte: moment(date).endOf('day').toDate(),
        },
        status: 'pending',
      },
    });

    return potentialOvertimes.map((overtime) => ({
      id: overtime.id,
      employeeId: overtime.employeeId,
      date: overtime.date,
      type: overtime.type as 'early-check-in' | 'late-check-out' | 'day-off',
      status: overtime.status as 'approved' | 'pending' | 'rejected',
      reviewedBy: overtime.reviewedBy || undefined, // Update the type to allow for null values
      reviewedAt: overtime.reviewedAt || undefined, // Update the type to allow for null values
      createdAt: overtime.createdAt,
      updatedAt: overtime.updatedAt,
      start: '', // Add the missing 'start' property
      end: '', // Add the missing 'end' property
      hours: 0, // Add the missing 'hours' property
    }));
  }

  private async getLatestShiftAdjustment(
    employeeId: string,
    date: Date,
  ): Promise<ShiftAdjustment | null> {
    const adjustment = await prisma.shiftAdjustmentRequest.findFirst({
      where: {
        employeeId,
        date: { lte: date },
        status: 'approved',
      },
      orderBy: { date: 'desc' },
      include: { requestedShift: true },
    });

    return adjustment
      ? {
          date: adjustment.date.toISOString().split('T')[0],
          requestedShiftId: adjustment.requestedShiftId,
          requestedShift: adjustment.requestedShift as ShiftData,
          status: adjustment.status as 'pending' | 'approved' | 'rejected',
          reason: adjustment.reason,
          createdAt: adjustment.createdAt,
          updatedAt: adjustment.updatedAt,
        }
      : null;
  }

  private async getApprovedOvertime(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    const overtime = await prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: moment(date).startOf('day').toDate(),
          lte: moment(date).endOf('day').toDate(),
        },
        status: 'approved',
      },
    });

    return overtime
      ? {
          ...overtime,
          approvedBy: '', // Add the missing 'approvedBy' property
          approvedAt: new Date(), // Add the missing 'approvedAt' property
        }
      : null;
  }

  public convertToUserData(user: any): UserData {
    return {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department.name,
      role: user.role as UserRole,
      profilePictureUrl: user.profilePictureUrl,
      profilePictureExternal: user.profilePictureExternal,
      shiftId: user.shiftId,
      assignedShift: user.assignedShift,
      overtimeHours: user.overtimeHours,
      potentialOvertimes:
        user.potentialOvertimes?.map(
          (po: {
            id: any;
            employeeId: any;
            date: any;
            hours: any;
            type: string;
            status: string;
            periods: string;
            reviewedBy: any;
            reviewedAt: any;
            createdAt: any;
            updatedAt: any;
          }) => ({
            id: po.id,
            employeeId: po.employeeId,
            date: po.date,
            hours: po.hours,
            type: po.type as 'early-check-in' | 'late-check-out' | 'day-off',
            status: po.status as 'pending' | 'approved' | 'rejected',
            periods: po.periods ? JSON.parse(po.periods as string) : undefined,
            reviewedBy: po.reviewedBy ?? undefined,
            reviewedAt: po.reviewedAt ?? undefined,
            createdAt: po.createdAt,
            updatedAt: po.updatedAt,
          }),
        ) ?? [],
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Helper methods for converting between different attendance record formats
  public convertInternalToAttendanceRecord(
    internal: Attendance,
  ): AttendanceRecord {
    return {
      id: internal.id,
      employeeId: internal.employeeId,
      date: internal.date,
      attendanceTime:
        internal.checkInTime || internal.checkOutTime || internal.date,
      checkInTime: internal.checkInTime,
      checkOutTime: internal.checkOutTime,
      isOvertime: internal.isOvertime,
      overtimeDuration: internal.overtimeDuration ?? 0,
      overtimeHours: internal.overtimeDuration ?? 0, // Use overtimeDuration if overtimeHours doesn't exist
      isDayOff: false,
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
      status: internal.status,
      isManualEntry: false,
    };
  }

  public convertExternalToAttendanceRecord(
    external: ExternalCheckInData,
  ): AttendanceRecord | undefined {
    const attendanceTime = parseDateSafely(external.sj, 'YYYY-MM-DD HH:mm:ss');
    const date = parseDateSafely(external.date, 'YYYY-MM-DD');

    if (!attendanceTime || !date) {
      logMessage(
        `Invalid date in external record: ${JSON.stringify(external)}`,
      );
      logMessage(`Attendance Time: ${external.sj}, Date: ${external.date}`);
      return undefined;
    }

    return {
      id: external.bh.toString(),
      employeeId: external.user_no,
      date: date.toDate(),
      attendanceTime: attendanceTime.toDate(),
      checkInTime: attendanceTime.toDate(),
      checkOutTime: null,
      isOvertime: false,
      isDayOff: false,
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
      overtimeHours: 0,
      overtimeDuration: 0,
    };
  }

  private getEffectiveShift(
    date: moment.Moment,
    user: UserData,
    shiftAdjustments: ShiftAdjustment[],
    shifts: Map<string, ShiftData>,
  ): ShiftData {
    const dateString = date.format('YYYY-MM-DD');
    const adjustment = shiftAdjustments.find((adj) => adj.date === dateString);

    if (adjustment) {
      return adjustment.requestedShift;
    }

    const userShift = shifts.get(user.shiftId);
    if (!userShift) {
      throw new Error(`Shift not found for ID: ${user.shiftId}`);
    }

    return userShift;
  }

  private async getAllShifts(): Promise<Map<string, ShiftData>> {
    logMessage('Fetching all shifts');
    const shifts = await prisma.shift.findMany();
    return new Map(shifts.map((shift) => [shift.id, shift as ShiftData]));
  }

  private async isUserShift104(employeeId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });
    return user?.assignedShift?.shiftCode === 'SHIFT104';
  }

  private createAbsentRecord(
    date: Date,
    employeeId: string,
    isWorkDay: boolean,
  ): ProcessedAttendance {
    return {
      date,
      status: isWorkDay ? 'absent' : 'off',
      employeeId,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      regularHours: 0,
      overtimeHours: 0,
      potentialOvertimePeriods: [],
      isOvertime: false,
      overtimeDuration: 0,
      detailedStatus: isWorkDay ? 'absent' : 'day-off',
      id: '',
      checkIn: undefined,
      checkOut: undefined,
      checkInDeviceSerial: null,
      checkOutDeviceSerial: null,
      isManualEntry: false,
    };
  }

  private createLeaveRecord(
    date: Date,
    employeeId: string,
  ): ProcessedAttendance {
    return {
      date,
      status: 'off',
      employeeId,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      regularHours: 0,
      overtimeHours: 0,
      potentialOvertimePeriods: [],
      isOvertime: false,
      overtimeDuration: 0,
      detailedStatus: 'leave',
      id: '',
      checkIn: undefined,
      checkOut: undefined,
      checkInDeviceSerial: null,
      checkOutDeviceSerial: null,
      isManualEntry: false,
    };
  }

  private validateAndCorrectAttendance(
    records: ProcessedAttendance[],
  ): ProcessedAttendance[] {
    return records.map((record) => {
      if (record.checkIn && record.checkOut) {
        const checkInTime = moment(record.checkIn);
        const checkOutTime = moment(record.checkOut);

        if (checkOutTime.isBefore(checkInTime)) {
          // Invalid check-out time, set status to incomplete
          record.status = 'incomplete';
          record.detailedStatus = 'invalid-checkout';
          record.checkOut = undefined;
          record.regularHours = 0;
          record.overtimeHours = 0;
        }
      }
      return record;
    });
  }
}

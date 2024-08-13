import { PrismaClient, Attendance } from '@prisma/client';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { ExternalDbService } from './ExternalDbService';
import { NotificationService } from './NotificationService';
import { HolidayService } from './HolidayService';
import { Shift104HolidayService } from './Shift104HolidayService';
import {
  ExternalCheckInData,
  AttendanceData,
  AttendanceStatusInfo,
  AttendanceRecord,
  ProcessedAttendance,
  ShiftData,
  ShiftAdjustment,
  ApprovedOvertime,
  AttendanceStatusType,
  UserData,
  PotentialOvertime,
  ManualEntryData,
  AttendanceStatusValue,
  FutureShiftAdjustment,
} from '../types/user';
import moment from 'moment-timezone';
import { logMessage } from '../utils/inMemoryLogger';
import { ILeaveServiceServer } from '..//types/LeaveService';
import {
  differenceInMinutes,
  differenceInHours,
  addMinutes,
  subMinutes,
  isBefore,
  isAfter,
  isWithinInterval,
  parse,
  parseISO,
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  subDays,
  isSameDay,
  isValid,
  compareAsc,
  addDays,
} from 'date-fns';

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

  private parseDate(date: Date | string): Date {
    if (typeof date === 'string') {
      return parse(date, 'yyyy-MM-dd HH:mm:ss', new Date());
    }
    return date;
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    if (!employeeId) {
      throw new Error('Employee ID is required');
    }

    try {
      const user = await this.getUser(employeeId);
      const userData = this.convertToUserData(user);

      const yesterday = subDays(startOfDay(new Date()), 1);
      const now = new Date();

      const [internalAttendances, externalAttendanceData] = await Promise.all([
        this.getInternalAttendances(employeeId, yesterday, now),
        this.externalDbService.getDailyAttendanceRecords(employeeId, 2),
      ]);

      const mergedAttendances = this.mergeAttendances(
        internalAttendances,
        externalAttendanceData.records,
      );
      const processedAttendances = await this.processAttendanceData(
        mergedAttendances,
        userData,
        yesterday,
        now,
      );
      const shiftAdjustments = await this.getShiftAdjustments(
        employeeId,
        yesterday,
        now,
      );
      const shifts = await this.getAllShifts();
      const shift = this.getEffectiveShift(
        now,
        userData,
        shiftAdjustments,
        shifts,
      );
      const isDayOff = await this.isDayOff(employeeId, now, shift);
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
        now,
      );
      const shiftAdjustment = await this.getLatestShiftAdjustment(
        employeeId,
        now,
      );
      const approvedOvertime = await this.getApprovedOvertime(employeeId, now);

      return this.createAttendanceStatusInfo(
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
    } catch (error) {
      console.error('Error in getLatestAttendanceStatus:', error);
      throw error;
    }
  }

  private mergeAttendances(
    internal: Attendance[],
    external: ExternalCheckInData[],
  ): AttendanceRecord[] {
    const internalRecords = internal.map(
      this.convertInternalToAttendanceRecord,
    );
    const externalRecords = external
      .map(this.convertExternalToAttendanceRecord)
      .filter((record): record is AttendanceRecord => record !== undefined);

    return [...internalRecords, ...externalRecords].sort((a, b) =>
      compareAsc(new Date(b.attendanceTime), new Date(a.attendanceTime)),
    );
  }

  async processPayroll(employeeId: string, startDate: Date, endDate: Date) {
    const user = await this.getUser(employeeId);
    const userData = this.convertToUserData(user);

    const payrollStartDate = subMinutes(addDays(new Date(startDate), 26), 1);
    const payrollEndDate = endOfDay(
      subMinutes(addDays(new Date(endDate), 25), 1),
    );

    const attendanceRecords = await this.getAttendanceRecords(
      employeeId,
      payrollStartDate,
      payrollEndDate,
    );
    const processedAttendance = await this.processAttendanceData(
      attendanceRecords,
      userData,
      payrollStartDate,
      payrollEndDate,
    );

    const summary = this.calculateSummary(processedAttendance);

    return {
      userData,
      processedAttendance,
      summary,
      payrollPeriod: { start: payrollStartDate, end: payrollEndDate },
    };
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

  private async getAttendanceRecords(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AttendanceRecord[]> {
    const [internalRecords, externalRecords] = await Promise.all([
      this.getInternalAttendances(employeeId, startDate, endDate),
      this.externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate,
        endDate,
      ),
    ]);

    const convertedInternalRecords = internalRecords.map(
      this.convertInternalToAttendanceRecord.bind(this),
    );
    const convertedExternalRecords = externalRecords.records
      .map(this.convertExternalToAttendanceRecord.bind(this))
      .filter((record): record is AttendanceRecord => record !== undefined);

    return [...convertedInternalRecords, ...convertedExternalRecords];
  }

  private async getInternalAttendances(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Attendance[]> {
    return prisma.attendance.findMany({
      where: {
        employeeId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'desc' },
    });
  }

  public async processAttendanceData(
    records: AttendanceRecord[],
    userData: UserData,
    startDate: Date,
    endDate: Date,
  ): Promise<ProcessedAttendance[]> {
    logMessage(`Processing ${records.length} attendance records`);
    logMessage(`Start date: ${startDate}, End date: ${endDate}`);

    const shift: ShiftData = {
      ...userData.assignedShift,
      timezone: 'Asia/Bangkok',
    };
    if (!shift) throw new Error('User has no assigned shift');

    const { recordsByDate, unpairedRecords } = this.groupAndPairRecords(
      records,
      shift,
    );

    if (unpairedRecords.length > 0) {
      logMessage(
        `Flagging ${unpairedRecords.length} unpaired records for admin review`,
      );
      await this.flagUnpairedRecordsForAdminReview(unpairedRecords);
    }

    const shiftAdjustments = await this.getShiftAdjustments(
      userData.employeeId,
      startDate,
      endDate,
    );
    logMessage(`Shift adjustments: ${JSON.stringify(shiftAdjustments)}`);

    const leaveRequests = await this.leaveServiceServer.getLeaveRequests(
      userData.employeeId,
    );
    logMessage(`Leave requests: ${JSON.stringify(leaveRequests)}`);

    const approvedOvertimes = await this.getApprovedOvertimes(
      userData.employeeId,
      startDate,
      endDate,
    );
    logMessage(`Approved overtimes: ${JSON.stringify(approvedOvertimes)}`);

    const processedAttendance: ProcessedAttendance[] = [];
    let currentDate = startOfDay(startDate);
    const endMoment = endOfDay(endDate);

    while (currentDate <= endMoment) {
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      logMessage(`Processing date: ${dateStr}`);

      const dayRecords = recordsByDate[dateStr] || [];
      const shifts = await this.getAllShifts();
      const effectiveShift = this.getEffectiveShift(
        currentDate,
        userData,
        shiftAdjustments,
        shifts,
      );
      const isDayOff = await this.isDayOff(
        userData.employeeId,
        currentDate,
        effectiveShift,
      );
      const isLeave = this.isOnLeave(currentDate, leaveRequests);
      logMessage(`Day off: ${isDayOff}, Leave: ${isLeave}`);

      if (dayRecords.length === 0) {
        if (isDayOff) {
          processedAttendance.push(
            this.createDayOffRecord(currentDate, userData.employeeId),
          );
          logMessage(`Created day off record for ${dateStr}`);
        } else if (isLeave) {
          processedAttendance.push(
            this.createLeaveRecord(currentDate, userData.employeeId),
          );
          logMessage(`Created leave record for ${dateStr}`);
        } else {
          processedAttendance.push(
            this.createAbsentRecord(currentDate, userData.employeeId, isDayOff),
          );
          logMessage(`Created absent record for ${dateStr}`);
        }
      } else {
        for (const record of dayRecords) {
          const processed = this.processAttendanceRecord(
            record,
            effectiveShift,
            isDayOff,
            approvedOvertimes,
          );
          processedAttendance.push(await processed);
          logMessage(
            `Processed attendance record for ${dateStr}: ${JSON.stringify(
              processed,
            )}`,
          );
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    const validatedAttendance =
      this.validateAndCorrectAttendance(processedAttendance);
    logMessage(
      `Validated and corrected attendance: ${JSON.stringify(validatedAttendance)}`,
    );

    return validatedAttendance;
  }

  private groupAndPairRecords(
    records: AttendanceRecord[],
    shift: ShiftData,
  ): {
    recordsByDate: Record<string, AttendanceRecord[]>;
    unpairedRecords: AttendanceRecord[];
  } {
    const recordsByDate: Record<string, AttendanceRecord[]> = {};
    const unpairedRecords: AttendanceRecord[] = [];

    records.sort((a, b) =>
      compareAsc(
        parse(a.attendanceTime, 'yyyy-MM-dd HH:mm:ss', new Date()),
        parse(b.attendanceTime, 'yyyy-MM-dd HH:mm:ss', new Date()),
      ),
    );

    for (const record of records) {
      const dateKey = format(
        parse(record.attendanceTime, 'yyyy-MM-dd HH:mm:ss', new Date()),
        'yyyy-MM-dd',
      );

      if (!recordsByDate[dateKey]) {
        recordsByDate[dateKey] = [];
      }

      const lastRecord =
        recordsByDate[dateKey][recordsByDate[dateKey].length - 1];

      if (!lastRecord || lastRecord.checkOutTime) {
        // Start a new pair
        recordsByDate[dateKey].push({ ...record, checkOutTime: null });
      } else {
        // Complete the pair
        lastRecord.checkOutTime = record.attendanceTime;
        lastRecord.checkOutDeviceSerial = record.checkInDeviceSerial;
      }
    }

    // Collect unpaired records for admin review
    Object.keys(recordsByDate).forEach((date) => {
      recordsByDate[date].forEach((record) => {
        if (!record.checkOutTime) {
          unpairedRecords.push(record);
        }
      });
    });

    return { recordsByDate, unpairedRecords };
  }

  private async processAttendanceRecord(
    record: AttendanceRecord,
    shift: ShiftData,
    isDayOff: boolean,
    approvedOvertimes: ApprovedOvertime[],
  ): Promise<ProcessedAttendance> {
    const checkIn = parse(
      record.checkInTime ?? '',
      'yyyy-MM-dd HH:mm:ss',
      new Date(),
    );
    const checkOut = record.checkOutTime
      ? parse(record.checkOutTime, 'yyyy-MM-dd HH:mm:ss', new Date())
      : null;

    // Adjust shiftStart and shiftEnd to handle check-outs after midnight
    const shiftStart = subMinutes(
      parse(record.checkInTime ?? '', 'yyyy-MM-dd HH:mm:ss', new Date()),
      0,
    );
    let shiftEnd = addMinutes(
      shiftStart,
      differenceInMinutes(
        parse(shift.endTime, 'HH:mm', new Date()),
        parse(shift.startTime, 'HH:mm', new Date()),
      ),
    );

    if (isBefore(shiftEnd, shiftStart)) shiftEnd = addMinutes(shiftEnd, 1440); // Add 24 hours if end time is before start time (crossing midnight)

    // Adjust checkOut to belong to the same payroll period if it's after midnight
    if (checkOut && isAfter(checkOut, shiftEnd)) {
      shiftEnd = addMinutes(shiftEnd, 1440); // Consider it in the next day if check-out is after midnight
    }

    const isEarlyCheckIn = isBefore(checkIn, subMinutes(shiftStart, 30));
    const isLateCheckIn = isAfter(checkIn, addMinutes(shiftStart, 15));
    const isLateCheckOut = checkOut
      ? isAfter(checkOut, addMinutes(shiftEnd, 15))
      : false;

    let status: AttendanceStatusValue = 'present';
    if (isDayOff) status = 'off';
    else if (!checkOut) status = 'incomplete';

    const regularHours = this.calculateRegularHours(
      checkIn,
      checkOut,
      shiftStart,
      shiftEnd,
    );
    const overtimeInfo = this.calculateOvertime(
      checkIn,
      checkOut,
      shiftStart,
      shiftEnd,
      approvedOvertimes,
    );

    // Calculate potential overtime
    const potentialOvertimeInfo = this.calculatePotentialOvertime(
      checkIn,
      checkOut ?? new Date(),
      shift,
    );

    // Flag potential overtime if any is detected
    if (potentialOvertimeInfo.duration > 0) {
      await this.flagPotentialOvertime({
        ...record,
        overtimeHours: potentialOvertimeInfo.duration,
        potentialOvertimePeriods: potentialOvertimeInfo.periods,
        status: 'present',
        date: record.checkInTime ? new Date(record.checkInTime) : new Date(),
        regularHours: 0,
        detailedStatus: '',
      });
    }

    return {
      id: record.id,
      employeeId: record.employeeId,
      date: checkIn,
      checkIn: record.checkInTime ?? undefined,
      checkOut: record.checkOutTime || undefined,
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
        isLateCheckOut,
      ),
      checkInDeviceSerial: record.checkInDeviceSerial,
      checkOutDeviceSerial: record.checkOutDeviceSerial,
      isManualEntry: record.isManualEntry,
    };
  }

  private calculateRegularHours(
    checkIn: Date,
    checkOut: Date | null,
    shiftStart: Date,
    shiftEnd: Date,
  ): number {
    if (!checkOut) return 0;
    const effectiveStart = checkIn > shiftStart ? checkIn : shiftStart;
    const effectiveEnd = checkOut < shiftEnd ? checkOut : shiftEnd;
    return Math.max(0, differenceInMinutes(effectiveEnd, effectiveStart) / 60);
  }

  private calculateOvertime(
    checkIn: Date,
    checkOut: Date | null,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertimes: ApprovedOvertime[],
  ): { duration: number; periods: { start: string; end: string }[] } {
    if (!checkOut) return { duration: 0, periods: [] };

    let overtimeDuration = 0;
    const periods: { start: string; end: string }[] = [];

    // Early check-in
    if (isBefore(checkIn, shiftStart)) {
      const earlyMinutes = differenceInMinutes(shiftStart, checkIn);
      const roundedEarlyMinutes = Math.floor(earlyMinutes / 30) * 30;
      if (roundedEarlyMinutes > 0) {
        overtimeDuration += roundedEarlyMinutes;
        periods.push({
          start: format(checkIn, 'HH:mm'),
          end: format(shiftStart, 'HH:mm'),
        });
      }
    }

    // Late check-out
    if (isAfter(checkOut, shiftEnd)) {
      const lateMinutes = differenceInMinutes(checkOut, shiftEnd);
      const roundedLateMinutes = Math.ceil(lateMinutes / 30) * 30;
      if (roundedLateMinutes > 0) {
        overtimeDuration += roundedLateMinutes;
        periods.push({
          start: format(shiftEnd, 'HH:mm'),
          end: format(checkOut, 'HH:mm'),
        });
      }
    }

    // Check if overtime is approved
    const isApproved = approvedOvertimes.some(
      (overtime) =>
        isSameDay(overtime.date, checkIn) &&
        !isBefore(overtime.startTime, checkIn) &&
        !isAfter(overtime.endTime, checkOut),
    );

    return {
      duration: isApproved ? overtimeDuration / 60 : 0,
      periods: isApproved ? periods : [],
    };
  }

  private async isDayOff(
    employeeId: string,
    date: Date,
    shift: ShiftData,
  ): Promise<boolean> {
    const dayOfWeek = date.getDay();
    if (!shift.workDays.includes(dayOfWeek)) return true;

    const isHoliday = await this.holidayService.isHoliday(date);
    if (isHoliday) return true;

    if (shift.shiftCode === 'SHIFT104') {
      const isShift104Holiday =
        await this.shift104HolidayService.isShift104Holiday(date);
      if (isShift104Holiday) return true;
    }

    const weeklyWorkDayCount = await this.getWeeklyWorkDayCount(
      employeeId,
      date,
    );
    return weeklyWorkDayCount >= 6;
  }

  private async getWeeklyWorkDayCount(
    employeeId: string,
    date: Date,
  ): Promise<number> {
    const startOfWeekDate = startOfWeek(date);
    const endOfWeekDate = endOfWeek(date);

    const attendances = await prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfWeekDate,
          lte: endOfWeekDate,
        },
        status: 'present',
      },
    });

    return attendances.length;
  }

  private isOnLeave(date: Date, leaveRequests: any[]): boolean {
    return leaveRequests.some((leave) =>
      isWithinInterval(date, {
        start: leave.startDate,
        end: leave.endDate,
      }),
    );
  }

  private getEffectiveShift(
    date: Date,
    userData: UserData,
    shiftAdjustments: any[],
    shifts: Map<string, ShiftData>,
  ): ShiftData {
    const adjustment = shiftAdjustments.find((adj) =>
      isSameDay(adj.date, date),
    );
    return adjustment ? adjustment.requestedShift : userData.assignedShift;
  }

  private async getShiftAdjustments(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ShiftAdjustment[]> {
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
    const overtimes = await prisma.overtimeRequest.findMany({
      where: {
        employeeId,
        status: 'approved',
        date: { gte: startDate, lte: endDate },
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

  private async getAllShifts(): Promise<Map<string, ShiftData>> {
    const shifts = await prisma.shift.findMany();
    return new Map(shifts.map((shift) => [shift.id, shift as ShiftData]));
  }

  private createAbsentRecord(
    date: Date,
    employeeId: string,
    isDayOff: boolean,
  ): ProcessedAttendance {
    return {
      id: `absent-${date.toISOString()}-${employeeId}`,
      employeeId,
      date,
      status: isDayOff ? 'absent' : 'off',
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      regularHours: 0,
      overtimeHours: 0,
      overtimeDuration: 0,
      potentialOvertimePeriods: [],
      isOvertime: false,
      detailedStatus: isDayOff ? 'absent' : 'off',
      checkInDeviceSerial: null,
      checkOutDeviceSerial: null,
      isManualEntry: false,
    };
  }

  private createDayOffRecord(
    date: Date,
    employeeId: string,
  ): ProcessedAttendance {
    return {
      id: `off-${date.toISOString()}-${employeeId}`,
      employeeId,
      date,
      status: 'off',
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      regularHours: 0,
      overtimeHours: 0,
      overtimeDuration: 0,
      potentialOvertimePeriods: [],
      isOvertime: false,
      detailedStatus: 'off',
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
      id: `leave-${date.toISOString()}-${employeeId}`,
      employeeId,
      date,
      status: 'off',
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      regularHours: 0,
      overtimeHours: 0,
      overtimeDuration: 0,
      potentialOvertimePeriods: [],
      isOvertime: false,
      detailedStatus: 'leave',
      checkInDeviceSerial: null,
      checkOutDeviceSerial: null,
      isManualEntry: false,
    };
  }

  private calculateSummary(processedAttendance: ProcessedAttendance[]) {
    return processedAttendance.reduce(
      (summary, record) => {
        summary.totalWorkingDays++;
        if (record.status === 'present') summary.totalPresent++;
        if (record.status === 'absent') summary.totalAbsent++;
        if (record.status === 'off' && record.detailedStatus === 'leave')
          summary.totalLeave++;
        if (record.status === 'incomplete') summary.totalIncomplete++;
        summary.totalOvertimeHours += record.overtimeHours ?? 0;
        summary.totalRegularHours += record.regularHours;
        return summary;
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

  private generateDetailedStatus(
    status: AttendanceStatusValue,
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

  private determineAttendanceStatus(
    latestAttendance: ProcessedAttendance,
    isDayOff: boolean,
  ): AttendanceStatusValue {
    if (isDayOff) return 'off';
    if (!latestAttendance.checkIn) return 'absent';
    if (!latestAttendance.checkOut) return 'incomplete';
    return 'present';
  }

  private convertToLatestAttendance(
    processedAttendance: ProcessedAttendance,
  ): AttendanceStatusInfo['latestAttendance'] {
    return {
      id: processedAttendance.id,
      employeeId: processedAttendance.employeeId,
      date: processedAttendance.date.toISOString(),
      checkInTime: processedAttendance.checkIn || null,
      checkOutTime: processedAttendance.checkOut || null,
      checkInDeviceSerial: processedAttendance.checkInDeviceSerial || '',
      checkOutDeviceSerial: processedAttendance.checkOutDeviceSerial || null,
      status: this.convertToAttendanceStatusType(processedAttendance.status),
      isManualEntry: processedAttendance.isManualEntry,
    };
  }

  private convertToAttendanceStatusType(
    status: AttendanceStatusValue,
  ): AttendanceStatusType {
    switch (status) {
      case 'present':
        return 'checked-out';
      case 'incomplete':
        return 'checked-in';
      case 'absent':
        return 'pending';
      case 'off':
      case 'holiday':
        return 'approved';
      default:
        return 'pending';
    }
  }
  // Public methods for external use

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

    const attendanceRecords = await this.getAttendanceRecords(
      employeeId,
      startDate,
      endDate,
    );
    return this.processAttendanceData(
      attendanceRecords,
      userData,
      startDate,
      endDate,
    );
  }

  async processManualEntry(
    manualEntryData: ManualEntryData,
  ): Promise<Attendance> {
    logMessage(
      `Processing manual entry request for ${manualEntryData.employeeId} on ${manualEntryData.date}`,
    );
    const user = await this.getUser(manualEntryData.employeeId);

    const manualEntry = await prisma.attendance.create({
      data: {
        employeeId: user.employeeId,
        date: new Date(manualEntryData.date),
        checkInTime: new Date(manualEntryData.checkInTime),
        checkOutTime: new Date(manualEntryData.checkOutTime),
        status: 'pending',
        isManualEntry: true,
        checkInReason: manualEntryData.reason,
        checkOutReason: manualEntryData.reason,
      },
    });

    await notificationService.sendNotification(
      user.employeeId,
      `Manual entry created for ${manualEntryData.date}. Please wait for admin approval.`,
    );

    return manualEntry;
  }

  async getApprovedOvertime(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    const overtime = await prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lte: endOfDay(date),
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

  private convertPotentialOvertime(po: any): PotentialOvertime {
    return {
      id: po.id,
      employeeId: po.employeeId,
      date: po.date,
      hours: po.hours,
      type: po.type as 'early-check-in' | 'late-check-out' | 'day-off',
      status: po.status as 'pending' | 'approved' | 'rejected',
      periods: po.periods ? JSON.parse(po.periods) : undefined,
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

  private async flagUnpairedRecordsForAdminReview(
    unpairedRecords: AttendanceRecord[],
  ): Promise<void> {
    if (unpairedRecords.length > 0) {
      // Notify admins of unpaired records
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN' } });
      for (const admin of admins) {
        await notificationService.sendNotification(
          admin.id,
          `${unpairedRecords.length} unpaired attendance records detected. Please review.`,
        );
      }
    }
  }

  private calculatePotentialOvertime(
    checkInTime: Date,
    checkOutTime: Date,
    shift: ShiftData,
  ): { duration: number; periods: { start: string; end: string }[] } {
    const shiftStart = parse(shift.startTime, 'HH:mm', checkInTime);
    let shiftEnd = parse(shift.endTime, 'HH:mm', checkInTime);
    if (isBefore(shiftEnd, shiftStart)) shiftEnd = addMinutes(shiftEnd, 1440); // Add 24 hours

    let overtimeDuration = 0;
    const periods: { start: string; end: string }[] = [];

    // Early check-in
    if (isBefore(checkInTime, shiftStart)) {
      const earlyMinutes = differenceInMinutes(shiftStart, checkInTime);
      const roundedEarlyMinutes = Math.floor(earlyMinutes / 30) * 30;
      if (roundedEarlyMinutes > 0) {
        overtimeDuration += roundedEarlyMinutes;
        periods.push({
          start: format(checkInTime, 'HH:mm'),
          end: format(shiftStart, 'HH:mm'),
        });
      }
    }

    // Late check-out
    if (isAfter(checkOutTime, shiftEnd)) {
      const lateMinutes = differenceInMinutes(checkOutTime, shiftEnd);
      const roundedLateMinutes = Math.ceil(lateMinutes / 30) * 30;
      if (roundedLateMinutes > 0) {
        overtimeDuration += roundedLateMinutes;
        periods.push({
          start: format(shiftEnd, 'HH:mm'),
          end: format(checkOutTime, 'HH:mm'),
        });
      }
    }

    return { duration: overtimeDuration / 60, periods };
  }

  private async flagPotentialOvertime(
    processedAttendance: ProcessedAttendance,
  ): Promise<void> {
    if ((processedAttendance.overtimeHours ?? 0) > 0) {
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
    processedAttendance: ProcessedAttendance,
  ): 'early-check-in' | 'late-check-out' | 'day-off' {
    const periods = processedAttendance.potentialOvertimePeriods ?? [];
    if (periods.length > 0) {
      const firstPeriod = periods[0];
      const startHour = parse(
        firstPeriod.start,
        'HH:mm',
        new Date(),
      ).getHours();
      if (startHour < 12) {
        return 'early-check-in';
      } else {
        return 'late-check-out';
      }
    }
    return 'day-off';
  }

  private createAttendanceStatusInfo(
    userData: UserData,
    latestAttendance: ProcessedAttendance,
    isCheckingIn: boolean,
    isDayOff: boolean,
    potentialOvertimes: PotentialOvertime[],
    shiftAdjustment: ShiftAdjustment | null,
    approvedOvertime: ApprovedOvertime | null,
    futureShifts: FutureShiftAdjustment[],
    futureOvertimes: ApprovedOvertime[],
  ): AttendanceStatusInfo {
    return {
      status: this.determineAttendanceStatus(latestAttendance, isDayOff),
      isOvertime: latestAttendance.isOvertime,
      overtimeDuration: latestAttendance.overtimeDuration,
      detailedStatus: latestAttendance.detailedStatus,
      isEarlyCheckIn: latestAttendance.isEarlyCheckIn,
      isLateCheckIn: latestAttendance.isLateCheckIn,
      isLateCheckOut: latestAttendance.isLateCheckOut,
      user: userData,
      latestAttendance: this.convertToLatestAttendance(latestAttendance),
      isCheckingIn,
      isDayOff,
      potentialOvertimes,
      shiftAdjustment,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
    };
  }

  private getLatestAttendance(
    processedAttendances: ProcessedAttendance[],
    now: Date,
  ): ProcessedAttendance {
    const todayAttendance = processedAttendances.find((a) =>
      isSameDay(a.date, now),
    );
    if (todayAttendance) return todayAttendance;

    const yesterdayAttendance = processedAttendances.find((a) =>
      isSameDay(a.date, subDays(now, 1)),
    );
    if (yesterdayAttendance && !yesterdayAttendance.checkOut)
      return yesterdayAttendance;

    return this.createAbsentRecord(
      now,
      processedAttendances[0].employeeId,
      false,
    );
  }

  private determineIfCheckingIn(
    latestAttendance: ProcessedAttendance,
  ): boolean {
    if (!latestAttendance.checkOut) return false;

    const lastCheckOutTime = latestAttendance.checkOut
      ? parseISO(latestAttendance.checkOut)
      : null;
    const currentTime = new Date();

    if (!lastCheckOutTime) return false;

    return differenceInHours(currentTime, lastCheckOutTime) >= 1;
  }

  // Additional methods

  async getTodayCheckIn(employeeId: string): Promise<Attendance | null> {
    const today = startOfDay(new Date());
    return prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: today,
          lt: addDays(today, 1),
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
        date: startOfDay(potentialCheckInTime),
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
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
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
    const checkTime = data.checkTime;

    try {
      const now = new Date();
      const todayStart = startOfDay(now);

      const shiftAdjustments = await this.getShiftAdjustments(
        user.employeeId,
        todayStart,
        now,
      );
      const shifts = await this.getAllShifts();

      const effectiveShift = this.getEffectiveShift(
        new Date(checkTime), // Convert checkTime to a Date object
        user,
        shiftAdjustments,
        shifts,
      );
      logMessage(
        `Effective shift for ${data.employeeId}: ${JSON.stringify(effectiveShift)}`,
      );

      const attendanceType = this.determineAttendanceType(
        new Date(checkTime),
        effectiveShift,
        data.isCheckIn,
      );

      if (data.isCheckIn) {
        return await this.processingService.processCheckIn(
          user.employeeId,
          new Date(checkTime), // Convert checkTime to a Date object
          attendanceType,
          {
            location: data.location,
            address: data.address,
            reason: data.reason,
            photo: data.photo,
            deviceSerial: data.deviceSerial,
            isLate:
              attendanceType === 'regular' &&
              isAfter(
                new Date(checkTime), // Convert checkTime to a Date object
                addMinutes(
                  parse(effectiveShift.startTime, 'HH:mm', new Date()),
                  15,
                ),
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
          new Date(checkTime), // Convert checkTime to a Date object
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
    checkTime: Date,
    shift: ShiftData,
    isCheckIn: boolean,
  ):
    | 'regular'
    | 'flexible-start'
    | 'flexible-end'
    | 'grace-period'
    | 'overtime' {
    const shiftStart = parse(shift.startTime, 'HH:mm', checkTime);
    const shiftEnd = parse(shift.endTime, 'HH:mm', checkTime);
    if (isBefore(shiftEnd, shiftStart))
      shiftEnd.setDate(shiftEnd.getDate() + 1);

    const flexibleStartTime = subMinutes(shiftStart, 30);
    const graceEndTime = addMinutes(shiftStart, 15);
    const flexibleEndTime = addMinutes(shiftEnd, 30);

    if (isCheckIn) {
      if (isBefore(checkTime, flexibleStartTime)) return 'overtime';
      if (
        isAfter(checkTime, flexibleStartTime) &&
        isBefore(checkTime, shiftStart)
      )
        return 'flexible-start';
      if (isAfter(checkTime, shiftStart) && isBefore(checkTime, graceEndTime))
        return 'grace-period';
      return 'regular';
    } else {
      if (isAfter(checkTime, flexibleEndTime)) return 'overtime';
      if (isAfter(checkTime, shiftEnd) && isBefore(checkTime, flexibleEndTime))
        return 'flexible-end';
      return 'regular';
    }
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

  private async getFutureShifts(
    employeeId: string,
  ): Promise<Array<{ date: string; shift: ShiftData }>> {
    const tomorrow = startOfDay(addDays(new Date(), 1));
    const twoWeeksLater = endOfDay(addDays(new Date(), 14));

    const shiftAdjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
        status: 'approved',
        date: { gte: tomorrow, lte: twoWeeksLater },
      },
      include: { requestedShift: true },
      orderBy: { date: 'asc' },
    });

    return shiftAdjustments.map((adj) => ({
      date: format(adj.date, 'yyyy-MM-dd'),
      shift: adj.requestedShift as ShiftData,
    }));
  }

  private async getFutureOvertimes(
    employeeId: string,
  ): Promise<ApprovedOvertime[]> {
    const tomorrow = startOfDay(addDays(new Date(), 1));
    const twoWeeksLater = endOfDay(addDays(new Date(), 14));

    return this.getApprovedOvertimes(employeeId, tomorrow, twoWeeksLater);
  }

  private async getPotentialOvertimes(
    employeeId: string,
    date: Date,
  ): Promise<PotentialOvertime[]> {
    const potentialOvertimes = await prisma.potentialOvertime.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lte: endOfDay(date),
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
      reviewedBy: overtime.reviewedBy || undefined,
      reviewedAt: overtime.reviewedAt || undefined,
      createdAt: overtime.createdAt,
      updatedAt: overtime.updatedAt,
      start: '',
      end: '',
      hours: 0,
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

  public convertToUserData(user: any): UserData {
    return {
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
      potentialOvertimes: user.potentialOvertimes.map(
        this.convertPotentialOvertime,
      ),
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
      attendanceTime:
        internal.checkInTime?.toISOString() || internal.date.toISOString(),
      checkInTime: internal.checkInTime?.toISOString() || null,
      checkOutTime: internal.checkOutTime?.toISOString() || null,
      isOvertime: internal.isOvertime,
      isDayOff: false, // Assuming this is not stored in the internal record
      overtimeStartTime: null,
      overtimeEndTime: null,
      overtimeHours: internal.overtimeDuration || 0,
      overtimeDuration: internal.overtimeDuration || 0,
      checkInLocation: null,
      checkOutLocation: null,
      checkInAddress: null,
      checkOutAddress: null,
      checkInReason: null,
      checkOutReason: null,
      checkInPhoto: null,
      checkOutPhoto: null,
      checkInDeviceSerial: internal.checkInDeviceSerial || null,
      checkOutDeviceSerial: internal.checkOutDeviceSerial || null,
      status: internal.status as AttendanceStatusType,
      isManualEntry: internal.isManualEntry,
    };
  }

  public convertExternalToAttendanceRecord(
    external: ExternalCheckInData,
  ): AttendanceRecord | undefined {
    console.log(`Raw sj value: ${external.sj}`);
    console.log(`Raw date value: ${external.date}`);
    console.log(`Raw time value: ${external.time}`);

    const attendanceTime = parseISO(external.sj);
    console.log(`Parsed attendanceTime: ${attendanceTime}`);

    if (!isValid(attendanceTime)) {
      console.log(
        `Invalid date in external record: ${JSON.stringify(external)}`,
      );
      return undefined;
    }

    const formattedAttendanceTime = isValid(attendanceTime)
      ? format(attendanceTime, 'yyyy-MM-dd HH:mm:ss')
      : '';

    const result: AttendanceRecord = {
      id: external.bh.toString(),
      employeeId: external.user_no,
      attendanceTime: formattedAttendanceTime || '', // Ensure a valid string
      checkInTime: null,
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

    console.log(`Converted record: ${JSON.stringify(result, null, 2)}`);
    return result;
  }

  private validateAndCorrectAttendance(
    records: ProcessedAttendance[],
  ): ProcessedAttendance[] {
    logMessage('Starting validation and correction of attendance records');

    const unpairedRecords: ProcessedAttendance[] = [];

    const validatedRecords = records.map((record, index) => {
      let correctedRecord = { ...record };

      /// Check for missing check-in or check-out
      if (!correctedRecord.checkIn || !correctedRecord.checkOut) {
        logMessage(`Record ${record.id}: Missing check-in or check-out`);
        correctedRecord.status = 'incomplete';
        correctedRecord.detailedStatus = correctedRecord.checkIn
          ? 'missing-checkout'
          : 'missing-checkin';

        // Add to unpaired records for flagging
        unpairedRecords.push(correctedRecord);
      }

      // Validate check-in and check-out times
      if (correctedRecord.checkIn && correctedRecord.checkOut) {
        const checkInTime = moment(correctedRecord.checkIn);
        const checkOutTime = moment(correctedRecord.checkOut);

        if (checkOutTime.isBefore(checkInTime)) {
          logMessage(
            `Record ${record.id}: Invalid check-out time (before check-in)`,
          );
          correctedRecord.status = 'invalid' as AttendanceStatusValue;
          correctedRecord.detailedStatus = 'invalid-checkout';
          correctedRecord.checkOut = undefined;
        }

        // Check for unreasonably long shifts (e.g., more than 24 hours)
        const shiftDuration = checkOutTime.diff(checkInTime, 'hours');
        if (shiftDuration > 24) {
          logMessage(
            `Record ${record.id}: Unreasonably long shift (${shiftDuration} hours)`,
          );
          correctedRecord.status = 'invalid' as AttendanceStatusValue;
          correctedRecord.detailedStatus = 'unreasonable-duration';
        }
      }

      // Validate regular hours and overtime
      if (correctedRecord.regularHours < 0) {
        logMessage(`Record ${record.id}: Negative regular hours`);
        correctedRecord.regularHours = 0;
      }
      if (correctedRecord.overtimeHours ?? 0 < 0) {
        logMessage(`Record ${record.id}: Negative overtime hours`);
        correctedRecord.overtimeHours = 0;
      }

      // Check for consecutive days off
      if (index > 0) {
        const prevRecord = records[index - 1];
        if (prevRecord.status === 'off' && correctedRecord.status === 'off') {
          const prevDate = moment(prevRecord.date);
          const currentDate = moment(correctedRecord.date);
          if (currentDate.diff(prevDate, 'days') === 1) {
            logMessage(`Record ${record.id}: Consecutive days off detected`);
            correctedRecord.detailedStatus = 'consecutive-days-off';
          }
        }
      }

      // Ensure status is a valid AttendanceStatusValue
      if (!this.isValidAttendanceStatus(correctedRecord.status)) {
        logMessage(
          `Record ${record.id}: Invalid status ${correctedRecord.status}`,
        );
        correctedRecord.status = 'invalid' as AttendanceStatusValue;
      }

      // Add a flag for unpaired records
      if (
        correctedRecord.status === 'incomplete' &&
        !correctedRecord.checkOut
      ) {
        logMessage(
          `Record ${record.id}: Unpaired record flagged for admin review`,
        );
        correctedRecord.detailedStatus = 'unpaired-for-review';
      }

      return correctedRecord;
    });

    // Flag unpaired records for review
    this.flagUnpairedRecordsForAdminReview(
      unpairedRecords as unknown as AttendanceRecord[],
    );

    return validatedRecords;
  }

  private isValidAttendanceStatus(
    status: any,
  ): status is AttendanceStatusValue {
    return [
      'present',
      'absent',
      'incomplete',
      'holiday',
      'off',
      'invalid',
    ].includes(status);
  }
}

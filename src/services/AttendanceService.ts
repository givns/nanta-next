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
  PotentialOvertime,
  ManualEntryData,
} from '../types/user';
import { UserRole } from '@/types/enum';
import moment from 'moment-timezone';
import { logMessage } from '../utils/inMemoryLogger';

const prisma = new PrismaClient();
const notificationService = new NotificationService();

export class AttendanceService {
  private processingService: AttendanceProcessingService;

  constructor(
    private externalDbService: ExternalDbService,
    private holidayService: HolidayService,
    private shift104HolidayService: Shift104HolidayService,
  ) {
    this.processingService = new AttendanceProcessingService();
    logMessage('AttendanceService initialized');
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

      const isWorkDay = await this.isWorkDay(user.employeeId, now.toDate());
      const isDayOff = await this.isDayOff(user, isWorkDay, now.toDate());

      const latestAttendance = this.getLatestAttendance(
        processedAttendances,
        now,
      );
      const isCheckingIn = this.determineIfCheckingIn(latestAttendance);

      const futureShifts = await this.getFutureShifts(user.employeeId);
      const futureOvertimes = await this.getFutureOvertimes(user.employeeId);
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

      return this.createAttendanceStatus(
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
      ...external.map(this.convertExternalToAttendanceRecord.bind(this)),
    ];

    return allAttendances.sort((a, b) =>
      moment(b.attendanceTime).diff(moment(a.attendanceTime)),
    );
  }

  async processAttendanceData(
    attendanceRecords: AttendanceRecord[],
    user: UserData,
    startDate: Date,
    endDate: Date,
  ): Promise<ProcessedAttendance[]> {
    logMessage(
      `Processing attendance data for ${user.employeeId} from ${startDate} to ${endDate}`,
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
    const shifts = await this.getAllShifts();

    const groupedRecords = this.groupRecordsByDate(
      attendanceRecords,
      user,
      shiftAdjustments,
      shifts,
    );

    const processedAttendance: ProcessedAttendance[] = [];
    const currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment)) {
      const dateStr = currentDate.format('YYYY-MM-DD');
      const records = groupedRecords[dateStr] || [];
      const effectiveShift = this.getEffectiveShift(
        currentDate,
        user,
        shiftAdjustments,
        shifts,
      );
      const isWorkDay = await this.isWorkDay(
        user.employeeId,
        currentDate.toDate(),
      );

      if (records.length === 0) {
        processedAttendance.push(
          this.createAbsentRecord(
            currentDate.toDate(),
            user.employeeId,
            isWorkDay,
          ),
        );
      } else {
        const pairedRecords = this.determineCheckInOutTimes(
          records,
          effectiveShift,
        );
        for (const pair of pairedRecords) {
          const status = this.determineStatus(
            pair.checkIn,
            pair.checkOut,
            user,
            effectiveShift,
            approvedOvertimes,
            isWorkDay,
          );
          processedAttendance.push(
            this.createProcessedRecord(
              pair.checkIn,
              pair.checkOut,
              status,
              user.employeeId,
            ),
          );
        }
      }

      currentDate.add(1, 'day');
    }

    return processedAttendance.sort((a, b) =>
      moment(b.date).diff(moment(a.date)),
    );
  }

  private determineStatus(
    checkIn: AttendanceRecord,
    checkOut: AttendanceRecord | null,
    user: UserData,
    effectiveShift: ShiftData,
    approvedOvertimes: ApprovedOvertime[],
    isWorkDay: boolean,
  ): AttendanceStatus {
    logMessage(`Determining status for ${user.employeeId} on ${checkIn.date}`);
    const checkInTime = moment(checkIn.attendanceTime);
    const checkOutTime = checkOut ? moment(checkOut.attendanceTime) : null;

    const shiftStart = moment(checkIn.date).set({
      hour: parseInt(effectiveShift.startTime.split(':')[0]),
      minute: parseInt(effectiveShift.startTime.split(':')[1]),
    });

    const shiftEnd = moment(checkIn.date).set({
      hour: parseInt(effectiveShift.endTime.split(':')[0]),
      minute: parseInt(effectiveShift.endTime.split(':')[1]),
    });

    if (shiftEnd.isBefore(shiftStart)) {
      shiftEnd.add(1, 'day');
    }

    let status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off' =
      'present';
    let isEarlyCheckIn = checkInTime.isBefore(
      shiftStart.clone().subtract(15, 'minutes'),
    );
    let isLateCheckIn = checkInTime.isAfter(
      shiftStart.clone().add(15, 'minutes'),
    );
    let isLateCheckOut: boolean | null =
      checkOutTime && checkOutTime.isAfter(shiftEnd.clone().add(15, 'minutes'));
    let overtimeDuration = 0;
    let isOvertime = false;
    let detailedStatus = '';

    if (!isWorkDay) {
      status = 'off';
      detailedStatus = 'day-off';
      if (checkOutTime) {
        isOvertime = true;
        overtimeDuration = checkOutTime.diff(checkInTime, 'hours', true);
        detailedStatus = 'overtime-on-day-off';
      }
    } else {
      if (!checkOutTime) {
        status = 'incomplete';
        detailedStatus = 'missing-check-out';
      } else {
        const approvedOvertime = this.findApprovedOvertime(
          checkIn.date,
          approvedOvertimes,
        );
        if (approvedOvertime) {
          isOvertime = true;
          overtimeDuration = this.calculateOvertimeDuration(
            checkInTime,
            checkOutTime,
            approvedOvertime,
          );
          detailedStatus = 'approved-overtime';
        } else if (isEarlyCheckIn || isLateCheckOut) {
          isOvertime = true;
          overtimeDuration = this.calculatePotentialOvertimeDuration(
            checkInTime,
            checkOutTime,
            shiftStart,
            shiftEnd,
          );
          detailedStatus = 'potential-overtime';
        } else {
          detailedStatus = 'regular';
        }
      }
    }

    return {
      status,
      isOvertime,
      overtimeDuration,
      detailedStatus,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut: isLateCheckOut || false,
      user,
      latestAttendance: null, // This will be set in createAttendanceStatus
      isCheckingIn: false, // This will be set in createAttendanceStatus
      isDayOff: !isWorkDay,
      potentialOvertime: [],
      shiftAdjustment: null,
      approvedOvertime: null,
      futureShifts: [],
      futureOvertimes: [],
    };
  }

  private findApprovedOvertime(
    date: Date,
    approvedOvertimes: ApprovedOvertime[],
  ): ApprovedOvertime | null {
    return (
      approvedOvertimes.find((ot) => moment(ot.date).isSame(date, 'day')) ||
      null
    );
  }

  private calculateOvertimeDuration(
    checkInTime: moment.Moment,
    checkOutTime: moment.Moment,
    approvedOvertime: ApprovedOvertime,
  ): number {
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

  private calculatePotentialOvertimeDuration(
    checkInTime: moment.Moment,
    checkOutTime: moment.Moment,
    shiftStart: moment.Moment,
    shiftEnd: moment.Moment,
  ): number {
    let overtimeDuration = 0;
    if (checkInTime.isBefore(shiftStart)) {
      overtimeDuration += shiftStart.diff(checkInTime, 'hours', true);
    }
    if (checkOutTime.isAfter(shiftEnd)) {
      overtimeDuration += checkOutTime.diff(shiftEnd, 'hours', true);
    }
    return overtimeDuration;
  }

  private async isWorkDay(userId: string, date: Date): Promise<boolean> {
    logMessage(`Checking if ${date} is a work day for user ${userId}`);
    return this.holidayService.isWorkingDay(userId, date);
  }

  private async isDayOff(
    user: any,
    isWorkDay: boolean,
    date: Date,
  ): Promise<boolean> {
    logMessage(`Checking if ${date} is a day off for user ${user.employeeId}`);
    if (!isWorkDay) return true;
    if (user.assignedShift.shiftCode === 'SHIFT104') {
      return this.shift104HolidayService.isShift104Holiday(date);
    }
    return false;
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
      potentialOvertime: potentialOvertimes,
      shiftAdjustment,
      approvedOvertime,
      futureShifts,
      futureOvertimes,
      status: latestAttendance.status,
      isOvertime: latestAttendance.isOvertime,
      overtimeDuration: latestAttendance.overtimeDuration,
      detailedStatus: latestAttendance.detailedStatus,
      isEarlyCheckIn: latestAttendance.isEarlyCheckIn,
      isLateCheckIn: latestAttendance.isLateCheckIn,
      isLateCheckOut: latestAttendance.isLateCheckOut,
    };
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

    const [internalAttendances, externalAttendanceData] = await Promise.all([
      this.getInternalAttendances(employeeId, startDate),
      this.externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate,
        endDate,
      ),
    ]);

    const mergedAttendances = this.mergeAttendances(
      internalAttendances,
      externalAttendanceData,
    );
    return this.processAttendanceData(
      mergedAttendances,
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

  private convertToUserData(user: any): UserData {
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
      potentialOvertimes: user.potentialOvertimes || [],
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      overtimeLeaveBalance: user.overtimeLeaveBalance,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  // Helper methods for converting between different attendance record formats
  private convertInternalToAttendanceRecord(
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
  ): AttendanceRecord {
    const attendanceTime = moment(external.sj).toDate();
    const date = moment(external.date).startOf('day').toDate();
    return {
      id: external.bh.toString(),
      employeeId: external.user_no,
      date: date,
      attendanceTime: attendanceTime,
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
    };
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
    logMessage(
      `Records grouped by date: ${JSON.stringify(recordsByDate, null, 2)}`,
    );

    return recordsByDate;
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

  private determineCheckInOutTimes(
    records: AttendanceRecord[],
    shift: ShiftData,
  ): Array<{ checkIn: AttendanceRecord; checkOut: AttendanceRecord | null }> {
    const pairs: Array<{
      checkIn: AttendanceRecord;
      checkOut: AttendanceRecord | null;
    }> = [];
    records.sort((a, b) =>
      moment(a.attendanceTime).diff(moment(b.attendanceTime)),
    );

    for (let i = 0; i < records.length; i++) {
      const current = records[i];
      const next = records[i + 1];

      const shiftStart = moment(current.attendanceTime).set({
        hour: parseInt(shift.startTime.split(':')[0]),
        minute: parseInt(shift.startTime.split(':')[1]),
      });
      let shiftEnd = moment(current.attendanceTime).set({
        hour: parseInt(shift.endTime.split(':')[0]),
        minute: parseInt(shift.endTime.split(':')[1]),
      });
      if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, 'day');

      if (
        !next ||
        moment(next.attendanceTime).diff(
          moment(current.attendanceTime),
          'hours',
        ) > 12
      ) {
        pairs.push({ checkIn: current, checkOut: null });
      } else {
        pairs.push({ checkIn: current, checkOut: next });
        i++; // Skip the next record as it's been used as check-out
      }
    }

    return pairs;
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
      overtimeHours: 0,
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

  private createProcessedRecord(
    checkIn: AttendanceRecord,
    checkOut: AttendanceRecord | null,
    status: AttendanceStatus,
    employeeId: string,
  ): ProcessedAttendance {
    return {
      date: checkIn.date,
      employeeId: employeeId,
      status: status.status,
      checkIn: checkIn.checkInTime?.toISOString() || undefined,
      checkOut: checkOut?.checkOutTime?.toISOString() || undefined,
      isEarlyCheckIn: status.isEarlyCheckIn,
      isLateCheckIn: status.isLateCheckIn,
      isLateCheckOut: status.isLateCheckOut,
      overtimeHours: status.overtimeDuration,
      detailedStatus: status.detailedStatus,
      id: checkIn.id,
      isOvertime: status.isOvertime,
      overtimeDuration: status.overtimeDuration || 0,
      checkInDeviceSerial: checkIn.checkInDeviceSerial,
      checkOutDeviceSerial: checkOut?.checkOutDeviceSerial || null,
      isManualEntry: checkIn.isManualEntry,
    };
  }
}

import { PrismaClient, Attendance, User, Shift } from '@prisma/client';
import { ExternalDbService } from './ExternalDbService';
import { ShiftManagementService } from './ShiftManagementService';
import { HolidayService } from './HolidayService';
import { Shift104HolidayService } from './Shift104HolidayService';
import { OvertimeServiceServer } from '../services/OvertimeServiceServer';
import { NotificationService } from './NotificationService';
import {
  AttendanceStatus,
  AttendanceRecord,
  ShiftData,
  ExternalCheckInData,
  AttendanceData,
  ApprovedOvertime,
  AttendanceStatusType,
} from '../types/user';
import { UserRole } from '@/types/enum';
import { logMessage } from '../utils/inMemoryLogger';
import moment from 'moment-timezone';

const TIMEZONE = 'Asia/Bangkok';
const prisma = new PrismaClient();

export class AttendanceService {
  private externalDbService: ExternalDbService;
  private shiftManagementService: ShiftManagementService;
  private holidayService: HolidayService;
  private shift104HolidayService: Shift104HolidayService;
  private overtimeService: OvertimeServiceServer;
  private notificationService: NotificationService;

  constructor() {
    this.externalDbService = new ExternalDbService();
    this.shiftManagementService = new ShiftManagementService();
    this.holidayService = new HolidayService();
    this.shift104HolidayService = new Shift104HolidayService();
    this.overtimeService = new OvertimeServiceServer();
    this.notificationService = new NotificationService();
  }

  async getConsolidatedAttendanceData(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AttendanceRecord[]> {
    logMessage(
      `Getting consolidated attendance data for employee ${employeeId} from ${startDate} to ${endDate}`,
    );

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { assignedShift: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const [internalAttendances, externalAttendances] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          userId: user.id,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: { date: 'asc' },
      }),
      this.externalDbService.getDailyAttendanceRecords(employeeId, 3),
    ]);

    const consolidatedAttendances = this.consolidateAttendanceRecords(
      internalAttendances,
      externalAttendances,
      user.assignedShift,
      startDate,
      endDate,
    );

    return Promise.all(
      consolidatedAttendances.map((attendance) =>
        this.processAttendanceRecord(attendance, user.assignedShift),
      ),
    );
  }

  private consolidateAttendanceRecords(
    internalAttendances: Attendance[],
    externalData: { records: ExternalCheckInData[]; userInfo: any },
    shift: Shift,
    startDate: Date,
    endDate: Date,
  ): AttendanceRecord[] {
    const { records: externalAttendances } = externalData;
    logMessage('Consolidating attendance records');

    const attendanceMap = new Map<string, AttendanceRecord>();

    // Process internal attendances
    internalAttendances.forEach((attendance) => {
      const dateKey = moment(attendance.date).format('YYYY-MM-DD');
      attendanceMap.set(dateKey, this.convertToAttendanceRecord(attendance));
    });

    // Process external attendances
    externalAttendances.forEach((externalAttendance) => {
      const dateKey = moment(externalAttendance.sj).format('YYYY-MM-DD');
      const existingRecord = attendanceMap.get(dateKey);

      if (existingRecord) {
        // Combine with existing record
        attendanceMap.set(
          dateKey,
          this.combineAttendanceRecords(existingRecord, externalAttendance),
        );
      } else {
        // Create new record from external data
        attendanceMap.set(
          dateKey,
          this.convertExternalToAttendanceRecord(externalAttendance),
        );
      }
    });

    // Fill in missing dates
    let currentDate = moment(startDate);
    const endMoment = moment(endDate);
    while (currentDate.isSameOrBefore(endMoment)) {
      const dateKey = currentDate.format('YYYY-MM-DD');
      if (!attendanceMap.has(dateKey)) {
        attendanceMap.set(
          dateKey,
          this.createEmptyAttendanceRecord(currentDate.toDate(), shift),
        );
      }
      currentDate.add(1, 'day');
    }

    return Array.from(attendanceMap.values()).sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }

  private combineAttendanceRecords(
    internal: AttendanceRecord,
    external: ExternalCheckInData,
  ): AttendanceRecord {
    const externalTime = moment(external.sj);
    const result = { ...internal };

    if (
      external.fx === 1 &&
      (!result.checkInTime || externalTime.isBefore(moment(result.checkInTime)))
    ) {
      result.checkInTime = externalTime.toDate();
      result.checkInDeviceSerial = external.dev_serial;
    } else if (
      external.fx === 2 &&
      (!result.checkOutTime ||
        externalTime.isAfter(moment(result.checkOutTime)))
    ) {
      result.checkOutTime = externalTime.toDate();
      result.checkOutDeviceSerial = external.dev_serial;
    }

    return result;
  }

  private async processAttendanceRecord(
    record: AttendanceRecord,
    shift: Shift,
  ): Promise<AttendanceRecord> {
    const shiftStart = moment.tz(
      `${moment(record.date).format('YYYY-MM-DD')} ${shift.startTime}`,
      TIMEZONE,
    );
    const shiftEnd = moment.tz(
      `${moment(record.date).format('YYYY-MM-DD')} ${shift.endTime}`,
      TIMEZONE,
    );
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, 'day');

    const isHoliday = await this.holidayService.isHoliday(record.date);
    const isShift104Holiday =
      shift.shiftCode === 'SHIFT104' &&
      (await this.shift104HolidayService.isShift104Holiday(record.date));

    if (isHoliday || isShift104Holiday) {
      record.status = 'holiday';
    } else if (!record.checkInTime && !record.checkOutTime) {
      record.status = 'absent';
    } else if (record.checkInTime && !record.checkOutTime) {
      record.status = 'incomplete';
    } else if (record.checkInTime && record.checkOutTime) {
      const checkInMoment = moment(record.checkInTime);
      const checkOutMoment = moment(record.checkOutTime);

      if (checkInMoment.isBefore(shiftStart.clone().subtract(30, 'minutes'))) {
        record.isEarlyCheckIn = true;
      }

      if (checkInMoment.isAfter(shiftStart.clone().add(15, 'minutes'))) {
        record.isLateCheckIn = true;
      }

      if (checkOutMoment.isAfter(shiftEnd.clone().add(30, 'minutes'))) {
        record.isLateCheckOut = true;
        const overtimeDuration = moment.duration(checkOutMoment.diff(shiftEnd));
        record.overtimeHours =
          Math.floor(overtimeDuration.asMinutes() / 30) * 0.5;
      }

      record.status = 'present';
    }

    return record;
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatus> {
    logMessage(
      `Getting latest attendance status for employee ID: ${employeeId}`,
    );

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: {
        assignedShift: true,
        department: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const now = moment().tz(TIMEZONE);
    const today = now.startOf('day');
    const threeDaysAgo = today.clone().subtract(3, 'days');

    const consolidatedAttendances = await this.getConsolidatedAttendanceData(
      employeeId,
      threeDaysAgo.toDate(),
      now.toDate(),
    );
    const latestAttendance =
      consolidatedAttendances[consolidatedAttendances.length - 1];

    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      user.id,
      now.toDate(),
    );
    const isDayOff =
      (await this.holidayService.isHoliday(now.toDate())) ||
      (user.assignedShift.shiftCode === 'SHIFT104' &&
        (await this.shift104HolidayService.isShift104Holiday(now.toDate())));

    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(
        user.id,
        now.toDate(),
      );
    const shiftAdjustment =
      await this.shiftManagementService.getShiftAdjustmentForDate(
        user.id,
        now.toDate(),
      );
    const futureShiftAdjustments =
      await this.shiftManagementService.getFutureShiftAdjustments(user.id);

    const status = this.determineAttendanceStatus(
      latestAttendance,
      effectiveShift?.shift,
      isDayOff,
      now,
    );

    return {
      user: {
        id: user.id,
        lineUserId: user.lineUserId || '',
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
      },
      latestAttendance: latestAttendance,
      isCheckingIn: !latestAttendance || !latestAttendance.checkOutTime,
      isDayOff,
      shiftAdjustment: shiftAdjustment
        ? this.convertToShiftAdjustment(shiftAdjustment)
        : null,
      futureShiftAdjustments: futureShiftAdjustments.map(
        this.convertToFutureShiftAdjustment,
      ),
      approvedOvertime: approvedOvertime
        ? this.convertToApprovedOvertime(approvedOvertime)
        : null,
      potentialOvertime: this.calculatePotentialOvertime(
        latestAttendance,
        effectiveShift?.shift,
      ),
      status,
      futureApprovedOvertimes: [],
    };
  }

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    logMessage(`Processing attendance for user ID: ${data.userId}`);
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (!user) throw new Error('User not found');

    const checkTime = moment.tz(data.checkTime, TIMEZONE);
    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      user.id,
      checkTime.toDate(),
    );

    let attendanceType = effectiveShift
      ? this.determineAttendanceType(
          checkTime,
          effectiveShift.shift,
          data.isOvertime,
        )
      : 'regular';
    let isLate = effectiveShift
      ? this.isLateCheckIn(checkTime, effectiveShift.shift)
      : false;

    logMessage(`Attendance type: ${attendanceType}, Is late: ${isLate}`);

    let attendance: Attendance;
    if (data.isCheckIn) {
      if (isLate && !data.reason) {
        throw new Error('Late check-in requires a reason');
      }
      attendance = await prisma.attendance.create({
        data: {
          userId: user.id,
          date: checkTime.startOf('day').toDate(),
          checkInTime: checkTime.toDate(),
          status: attendanceType,
          checkInLocation: JSON.stringify(data.location),
          checkInAddress: data.address,
          checkInReason: isLate ? data.reason : undefined,
          checkInPhoto: data.photo,
          checkInDeviceSerial: data.deviceSerial,
          isManualEntry: false,
        },
      });
    } else {
      const existingAttendance = await prisma.attendance.findFirst({
        where: {
          userId: user.id,
          date: checkTime.startOf('day').toDate(),
          checkOutTime: null,
        },
      });

      if (!existingAttendance) {
        throw new Error('No matching check-in found for this check-out');
      }

      attendance = await prisma.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          checkOutTime: checkTime.toDate(),
          status: attendanceType,
          checkOutLocation: JSON.stringify(data.location),
          checkOutAddress: data.address,
          checkOutReason: data.reason,
          checkOutPhoto: data.photo,
          checkOutDeviceSerial: data.deviceSerial,
        },
      });

      await this.handleUnapprovedOvertime(user.id, checkTime.toDate());
    }

    return attendance;
  }

  async handleMidDayShiftAdjustment(
    userId: string,
    date: Date,
    newShift: ShiftData,
  ): Promise<void> {
    logMessage(`Handling mid-day shift adjustment for user ID: ${userId}`);
    const adjustment = await this.shiftManagementService.requestShiftAdjustment(
      userId,
      newShift.id,
      date,
      'Mid-day shift adjustment',
    );

    const attendance = await prisma.attendance.findFirst({
      where: { userId, date: { equals: date } },
    });

    if (attendance) {
      await this.processAttendanceRecord(
        this.convertToAttendanceRecord(attendance),
        newShift,
      );
    }
  }

  private determineAttendanceType(
    checkTime: moment.Moment,
    shift: ShiftData,
    isOvertime: boolean,
  ): AttendanceStatusType {
    if (isOvertime) return 'overtime';
    const shiftStart = moment.tz(
      `${checkTime.format('YYYY-MM-DD')} ${shift.startTime}`,
      TIMEZONE,
    );
    const shiftEnd = moment.tz(
      `${checkTime.format('YYYY-MM-DD')} ${shift.endTime}`,
      TIMEZONE,
    );
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, 'day');

    if (checkTime.isBefore(shiftStart)) return 'early-check-in';
    if (checkTime.isAfter(shiftEnd)) return 'late-check-out';
    if (
      checkTime.isAfter(shiftStart) &&
      checkTime.isBefore(shiftStart.clone().add(15, 'minutes'))
    )
      return 'grace-period';
    return 'present';
  }

  private isLateCheckIn(checkTime: moment.Moment, shift: ShiftData): boolean {
    const shiftStart = moment.tz(
      `${checkTime.format('YYYY-MM-DD')} ${shift.startTime}`,
      TIMEZONE,
    );
    return checkTime.isAfter(shiftStart.clone().add(15, 'minutes'));
  }

  private determineAttendanceStatus(
    latestAttendance: AttendanceRecord | null,
    shift: ShiftData | undefined,
    isDayOff: boolean,
    now: moment.Moment,
  ): AttendanceStatusType {
    if (isDayOff) return 'day-off';
    if (!latestAttendance) return 'not-checked-in';
    if (latestAttendance.checkOutTime) return 'checked-out';
    if (latestAttendance.checkInTime) {
      if (!shift) return 'checked-in';
      const shiftEnd = moment.tz(
        `${now.format('YYYY-MM-DD')} ${shift.endTime}`,
        TIMEZONE,
      );
      if (now.isAfter(shiftEnd)) return 'overtime-ongoing';
      return 'checked-in';
    }
    return 'not-checked-in';
  }

  private calculatePotentialOvertime(
    latestAttendance: AttendanceRecord | null,
    shift: ShiftData | undefined,
  ): { start: string; end: string } | null {
    if (!latestAttendance || !latestAttendance.checkInTime || !shift)
      return null;
    const checkInTime = moment(latestAttendance.checkInTime).tz(TIMEZONE);
    const checkOutTime = latestAttendance.checkOutTime
      ? moment(latestAttendance.checkOutTime).tz(TIMEZONE)
      : moment().tz(TIMEZONE);
    const shiftStart = moment.tz(
      `${checkInTime.format('YYYY-MM-DD')} ${shift.startTime}`,
      TIMEZONE,
    );
    const shiftEnd = moment.tz(
      `${checkInTime.format('YYYY-MM-DD')} ${shift.endTime}`,
      TIMEZONE,
    );
    if (shiftEnd.isBefore(shiftStart)) shiftEnd.add(1, 'day');

    let potentialStart = null;
    let potentialEnd = null;

    if (checkInTime.isBefore(shiftStart.clone().subtract(30, 'minutes'))) {
      potentialStart = checkInTime.format('HH:mm');
    }
    if (checkOutTime.isAfter(shiftEnd.clone().add(30, 'minutes'))) {
      potentialEnd = checkOutTime.format('HH:mm');
    }

    if (potentialStart || potentialEnd) {
      return {
        start: potentialStart || shiftStart.format('HH:mm'),
        end: potentialEnd || shiftEnd.format('HH:mm'),
      };
    }

    return null;
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

  private convertToAttendanceRecord(attendance: Attendance): AttendanceRecord {
    return {
      id: attendance.id,
      userId: attendance.userId,
      employeeId: attendance.userId, // Assuming userId is used as employeeId
      date: attendance.date,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      status: attendance.status as AttendanceStatusType,
      checkInDeviceSerial: attendance.checkInDeviceSerial,
      checkOutDeviceSerial: attendance.checkOutDeviceSerial,
      checkInLocation: attendance.checkInLocation
        ? JSON.parse(attendance.checkInLocation as string)
        : null,
      checkOutLocation: attendance.checkOutLocation
        ? JSON.parse(attendance.checkOutLocation as string)
        : null,
      isManualEntry: attendance.isManualEntry,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      overtimeHours: 0,
      overtimeStartTime: null,
      overtimeEndTime: null,
      checkInAddress: null,
      checkOutAddress: null,
      checkInReason: null,
      checkOutReason: null,
      checkInPhoto: null,
      checkOutPhoto: null,
    };
  }

  private convertExternalToAttendanceRecord(
    external: ExternalCheckInData,
  ): AttendanceRecord {
    const checkTime = moment.tz(external.sj, TIMEZONE);
    return {
      id: `external_${external.bh}`,
      userId: '',
      employeeId: external.user_no,
      date: checkTime.startOf('day').toDate(),
      checkInTime: external.fx === 1 ? checkTime.toDate() : null,
      checkOutTime: external.fx === 2 ? checkTime.toDate() : null,
      status: 'present',
      checkInDeviceSerial: external.fx === 1 ? external.dev_serial : null,
      checkOutDeviceSerial: external.fx === 2 ? external.dev_serial : null,
      overtimeStartTime: null,
      overtimeEndTime: null,
      checkInAddress: null,
      checkOutAddress: null,
      checkInReason: null,
      checkOutReason: null,
      checkInPhoto: null,
      checkOutPhoto: null,
      checkInLocation: null,
      checkOutLocation: null,
      isManualEntry: false,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      overtimeHours: 0,
    };
  }

  private createEmptyAttendanceRecord(
    date: Date,
    shift: Shift,
  ): AttendanceRecord {
    return {
      id: `empty_${date.getTime()}`,
      userId: '',
      date: date,
      checkInTime: null,
      checkOutTime: null,
      status: 'absent',
      employeeId: '',
      overtimeStartTime: null,
      overtimeEndTime: null,
      checkInAddress: null,
      checkOutAddress: null,
      checkInReason: null,
      checkOutReason: null,
      checkInPhoto: null,
      checkOutPhoto: null,
      checkInDeviceSerial: null,
      checkOutDeviceSerial: null,
      checkInLocation: null,
      checkOutLocation: null,
      isManualEntry: false,
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      overtimeHours: 0,
    };
  }

  private convertToApprovedOvertime(overtime: any): ApprovedOvertime {
    return {
      id: overtime.id,
      userId: overtime.userId,
      date: overtime.date,
      startTime: overtime.startTime,
      endTime: overtime.endTime,
      status: overtime.status,
      reason: overtime.reason,
      approvedBy: overtime.approvedBy,
      approvedAt: overtime.approvedAt,
    };
  }

  private convertToShiftAdjustment(adjustment: any): any {
    return {
      date: adjustment.date.toISOString().split('T')[0],
      requestedShiftId: adjustment.requestedShiftId,
      requestedShift: this.convertToShiftData(adjustment.requestedShift),
      status: adjustment.status,
    };
  }

  private convertToFutureShiftAdjustment(adjustment: any): any {
    return {
      date: adjustment.date.toISOString(),
      shift: this.convertToShiftData(adjustment.requestedShift),
    };
  }

  async processExternalCheckInOut(
    externalCheckIn: ExternalCheckInData,
    userInfo: any,
  ): Promise<Attendance> {
    logMessage(
      `Processing external check-in/out for user: ${userInfo.user_no}`,
    );
    const user = await prisma.user.findUnique({
      where: { employeeId: userInfo.user_no.toString() },
    });
    if (!user) throw new Error('User not found');

    const checkTime = moment.tz(externalCheckIn.sj, TIMEZONE);
    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      user.id,
      checkTime.toDate(),
    );

    const attendanceData: AttendanceData = {
      userId: user.id,
      employeeId: user.employeeId,
      lineUserId: user.lineUserId,
      checkTime: checkTime.toDate(),
      location: JSON.stringify({ lat: 0, lng: 0 }), // Assuming no location data from external system
      address: 'N/A',
      reason: '',
      photo: null,
      deviceSerial: `EXT_${externalCheckIn.dev_serial}`,
      isCheckIn: externalCheckIn.fx === 1,
      isOvertime: false, // This will be determined by the processing service
      isLate: false, // This will be determined by the processing service
    };

    return this.processAttendance(attendanceData);
  }

  async getAttendanceHistory(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<AttendanceRecord[]> {
    logMessage(
      `Fetching attendance history for user ${userId} from ${startDate} to ${endDate}`,
    );
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { assignedShift: true },
    });
    if (!user) throw new Error('User not found');

    return this.getConsolidatedAttendanceData(
      user.employeeId,
      startDate,
      endDate,
    );
  }

  async requestManualEntry(
    userId: string,
    date: Date,
    checkInTime: Date,
    checkOutTime: Date,
    reason: string,
  ): Promise<Attendance> {
    logMessage(`Requesting manual entry for user ${userId} on ${date}`);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const manualEntry = await prisma.attendance.create({
      data: {
        userId,
        date,
        checkInTime,
        checkOutTime,
        status: 'manual-entry-pending',
        isManualEntry: true,
        checkInReason: reason,
        checkOutReason: reason,
        checkInLocation: JSON.stringify({ lat: 0, lng: 0 }), // Default location for manual entries
        checkOutLocation: JSON.stringify({ lat: 0, lng: 0 }),
        checkInDeviceSerial: 'MANUAL_ENTRY',
        checkOutDeviceSerial: 'MANUAL_ENTRY',
      },
    });

    await this.notificationService.sendNotification(
      user.id,
      `Manual entry request created for ${date.toDateString()}. Awaiting approval.`,
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

    await this.notificationService.sendNotification(
      attendance.userId,
      `Your manual entry for ${attendance.date.toDateString()} has been approved.`,
    );

    return approvedAttendance;
  }

  async handleUnapprovedOvertime(
    userId: string,
    checkOutTime: Date,
  ): Promise<void> {
    logMessage(
      `Handling unapproved overtime for user ${userId} at ${checkOutTime}`,
    );
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const checkOutMoment = moment(checkOutTime).tz(TIMEZONE);
    const effectiveShift = await this.shiftManagementService.getEffectiveShift(
      userId,
      checkOutTime,
    );
    const shiftEnd = moment.tz(
      `${checkOutMoment.format('YYYY-MM-DD')} ${effectiveShift?.shiftEnd}`,
      TIMEZONE,
    );

    if (checkOutMoment.isAfter(shiftEnd.add(30, 'minutes'))) {
      const overtimeDuration = moment.duration(checkOutMoment.diff(shiftEnd));
      const roundedOvertimeMinutes =
        Math.floor(overtimeDuration.asMinutes() / 30) * 30;

      await this.overtimeService.createUnapprovedOvertime(
        userId,
        shiftEnd.toDate(),
        checkOutTime,
        roundedOvertimeMinutes,
      );

      await this.notificationService.sendNotification(
        userId,
        `Unapproved overtime detected: ${roundedOvertimeMinutes} minutes`,
      );
    }
  }

  async closeOpenAttendances(): Promise<void> {
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
          attendance.userId,
          attendance.date,
        );

      if (effectiveShift) {
        const shiftEnd = moment.tz(
          `${moment(attendance.date).format('YYYY-MM-DD')} ${effectiveShift.shift.endTime}`,
          TIMEZONE,
        );
        const cutoffTime = shiftEnd.clone().add(4, 'hours');

        if (moment().isAfter(cutoffTime)) {
          await prisma.attendance.update({
            where: { id: attendance.id },
            data: {
              checkOutTime: shiftEnd.toDate(),
              status: 'auto-checked-out',
              checkOutReason: 'Auto-closed after 4 hours from shift end',
            },
          });

          await this.notificationService.sendNotification(
            attendance.userId,
            `Your attendance for ${attendance.date.toDateString()} was automatically closed.`,
          );
        }
      }
    }
  }

  async getTodayCheckIn(userId: string): Promise<Attendance | null> {
    logMessage(`Getting today's check-in for user ${userId}`);
    const today = moment().tz(TIMEZONE).startOf('day');
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
    logMessage(`Creating pending attendance for user ${userId}`);
    return prisma.attendance.create({
      data: {
        userId,
        date: moment(potentialCheckInTime).tz(TIMEZONE).startOf('day').toDate(),
        checkInTime: potentialCheckInTime,
        checkOutTime,
        status: 'PENDING_APPROVAL',
        checkInLocation: 'UNKNOWN',
        checkOutLocation: 'UNKNOWN',
      },
    });
  }
}

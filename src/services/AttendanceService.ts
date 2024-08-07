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
      const yesterday = moment().subtract(1, 'days').startOf('day');
      console.log(`Fetching attendance data from ${yesterday.format()} to now`);
      const now = moment();

      const [internalAttendances, externalAttendanceData] = await Promise.all([
        prisma.attendance.findMany({
          where: {
            employeeId: user.employeeId,
            date: { gte: yesterday.toDate() },
          },
          orderBy: { date: 'desc' },
        }),
        this.externalDbService.getDailyAttendanceRecords(employeeId, 2), // Fetch only 2 day of external data
      ]);

      logMessage(
        `Internal attendances: ${JSON.stringify(internalAttendances, null, 2)}`,
      );
      logMessage(
        `External attendance data: ${JSON.stringify(externalAttendanceData, null, 2)}`,
      );

      const mergedAttendances = this.mergeAttendances(
        internalAttendances,
        externalAttendanceData.records,
      );

      const processedAttendances = await this.processAttendanceData(
        mergedAttendances,
        userData,
        yesterday.toDate(),
        now.toDate(),
        new Map([user.assignedShift].map((shift) => [shift.id, shift])),
      );

      // When processing each day's attendance:

      const isWorkDay = await this.holidayService.isWorkingDay(
        user.id,
        now.toDate(),
      );
      let isDayOff = !isWorkDay;

      // If it's not a regular work day, check if we're under the weekly quota
      if (isDayOff) {
        const weekStart = now.startOf('week');
        const weekEnd = moment(weekStart).endOf('week');
        const weeklyWorkDays = await this.getWeeklyWorkDays(
          employeeId,
          weekStart.toDate(),
          weekEnd.toDate(),
        );
        const workedDaysThisWeek =
          weeklyWorkDays.get(weekStart.format('YYYY-MM-DD')) || 0;

        if (workedDaysThisWeek < 6) {
          isDayOff = false;
        }
      }

      console.log('Is work day:', isWorkDay);

      if (user.assignedShift.shiftCode === 'SHIFT104') {
        const isShift104Holiday =
          await this.shift104HolidayService.isShift104Holiday(now.toDate());
        if (isShift104Holiday) {
          isDayOff = true;
        }
      }

      let latestAttendance = processedAttendances[0];
      const currentTime = moment();
      const todayShiftStart = moment().set({
        hour: parseInt(user.assignedShift.startTime.split(':')[0]),
        minute: parseInt(user.assignedShift.startTime.split(':')[1]),
      });

      if (currentTime.isBefore(todayShiftStart)) {
        // If current time is before today's shift start, use the latest processed attendance
      } else {
        // If current time is after today's shift start, create an 'absent' record if no attendance found for today
        if (moment(latestAttendance.date).isBefore(moment().startOf('day'))) {
          latestAttendance = this.createAbsentRecord(
            new Date(),
            user.employeeId,
            isWorkDay,
          );
        }
      }

      logMessage(
        `Latest attendance: ${JSON.stringify(latestAttendance, null, 2)}`,
      );

      const futureShifts = await this.getFutureShifts(user.id);
      const futureOvertimes = await this.getFutureOvertimes(user.id);

      const potentialOvertimes = await this.getPotentialOvertime(
        employeeId,
        currentTime.toDate(),
      );

      logMessage(
        `Calculated potential overtime: ${JSON.stringify(potentialOvertimes)}`,
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
        user: this.convertToUserData(user),
        latestAttendance: latestAttendance
          ? {
              id: latestAttendance.id,
              employeeId: latestAttendance.employeeId,
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
        potentialOvertimes: potentialOvertimes ? [potentialOvertimes] : [],
        shiftAdjustment: null,
        approvedOvertime: null,
        futureShifts,
        futureOvertimes,
        status: 'present',
        isOvertime: false,
        overtimeDuration: undefined,
        detailedStatus: '',
        isEarlyCheckIn: undefined,
        isLateCheckIn: undefined,
        isLateCheckOut: undefined,
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

  private mergeAttendances(
    internal: Attendance[],
    external: ExternalCheckInData[],
  ): AttendanceRecord[] {
    const allAttendances = [
      ...internal.map(this.convertInternalToAttendanceRecord),
      ...external.map(this.convertExternalToAttendanceRecord.bind(this)),
    ];

    return allAttendances.sort((a, b) =>
      moment(b.checkInTime || b.date).diff(moment(a.checkInTime || a.date)),
    );
  }

  async processAttendanceData(
    attendanceRecords: AttendanceRecord[],
    user: UserData,
    startDate: Date,
    endDate: Date,
    shifts: Map<string, ShiftData>,
  ): Promise<ProcessedAttendance[]> {
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
      const isWorkDay = effectiveShift.workDays.includes(currentDate.day());

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
          const statusInfo = this.determineStatus(
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
              statusInfo,
              user.employeeId,
            ),
          );
        }
      }

      currentDate.add(1, 'day');
    }

    logMessage(
      `Final processed attendance: ${JSON.stringify(processedAttendance, null, 2)}`,
    );

    return processedAttendance.sort((a, b) =>
      moment(b.date).diff(moment(a.date)),
    );
  }

  private async getInternalAttendanceRecord(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    const attendance = await prisma.attendance.findFirst({
      where: { employeeId },
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

  private determineStatus(
    checkIn: AttendanceRecord,
    checkOut: AttendanceRecord | null,
    user: UserData,
    effectiveShift: ShiftData,
    approvedOvertimes: ApprovedOvertime[],
    isWorkDay: boolean,
  ): AttendanceStatus {
    let status: 'present' | 'absent' | 'incomplete' | 'holiday' | 'off' =
      'absent';
    let isEarlyCheckIn = false;
    let isLateCheckIn = false;
    let isLateCheckOut = false;
    let overtimeDuration = 0;
    let isOvertime = false;
    let detailedStatus = '';
    let potentialOvertimes: any[] = []; // Declare and initialize the potentialOvertimes variable

    // Rest of the code...

    return {
      user: user,
      latestAttendance: {
        id: checkIn.id,
        employeeId: checkIn.employeeId,
        date: checkIn.date.toISOString(),
        checkInTime: checkIn.attendanceTime?.toISOString() || null,
        checkOutTime: checkOut?.attendanceTime?.toISOString() || null,
        checkInDeviceSerial: checkIn.checkInDeviceSerial || '',
        checkOutDeviceSerial: checkOut?.checkOutDeviceSerial || null,
        status: status as AttendanceStatusType,
        isManualEntry: checkIn.isManualEntry,
      },
      isCheckingIn: checkOut === null,
      isDayOff: !isWorkDay,
      potentialOvertimes, // You may want to calculate this
      shiftAdjustment: null, // You may want to include this information
      approvedOvertime: null, // You may want to include this information
      futureShifts: [], // You may want to include this information
      futureOvertimes: [], // You may want to include this information
      status,
      isOvertime,
      overtimeDuration,
      detailedStatus,
      isEarlyCheckIn,
      isLateCheckIn,
      isLateCheckOut,
    };
  }

  private ensureAttendanceRecord(record: any): AttendanceRecord {
    return {
      id: record.id || record.bh?.toString() || '',
      employeeId: record.employeeId || record.user_no?.toString() || '',
      date: record.date ? new Date(record.date) : new Date(),
      attendanceTime: record.attendanceTime,
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

  async getHistoricalAttendance(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ProcessedAttendance[]> {
    console.log(
      `Fetching historical attendance for employeeId: ${employeeId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

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

    const userData = this.convertToUserData(user);

    const shifts = await prisma.shift.findMany();
    const shiftsMap = new Map(
      shifts.map((shift) => [shift.id, shift as ShiftData]),
    );

    const [internalAttendances, externalAttendanceData] = await Promise.all([
      prisma.attendance.findMany({
        where: {
          employeeId: user.employeeId,
          date: { gte: startDate, lte: endDate },
        },
        orderBy: [{ date: 'asc' }, { checkInTime: 'asc' }],
      }),
      this.externalDbService.getHistoricalAttendanceRecords(
        employeeId,
        startDate,
        endDate,
      ),
    ]);

    console.log(
      `Found ${internalAttendances.length} internal and ${externalAttendanceData.length} external attendance records`,
    );

    const allRecords = [
      ...internalAttendances,
      ...externalAttendanceData.map((record) =>
        this.convertExternalToAttendanceRecord(record),
      ),
    ].sort((a, b) => moment(a.checkInTime).diff(moment(b.checkInTime)));

    const processedAttendance = await this.processAttendanceData(
      allRecords.map((record) => this.ensureAttendanceRecord(record)),
      userData,
      startDate,
      endDate,
      shiftsMap,
    );

    console.log(`Processed ${processedAttendance.length} attendance records`);

    return processedAttendance;
  }

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

  async getApprovedOvertimes(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ApprovedOvertime[]> {
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

  async getShiftAdjustments(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ShiftAdjustment[]> {
    const adjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
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

  async getPotentialOvertime(
    employeeId: string,
    date: Date,
  ): Promise<PotentialOvertime | null> {
    const potentialOvertime = await prisma.potentialOvertime.findFirst({
      where: {
        employeeId,
        date: {
          gte: moment(date).startOf('day').toDate(),
          lte: moment(date).endOf('day').toDate(),
        },
        status: 'pending',
      },
    });

    return potentialOvertime
      ? {
          ...potentialOvertime,
          type: potentialOvertime.type as
            | 'early-check-in'
            | 'late-check-out'
            | 'day-off',
          status: potentialOvertime.status as
            | 'approved'
            | 'pending'
            | 'rejected',
          reviewedBy: potentialOvertime.reviewedBy || undefined,
          reviewedAt: potentialOvertime.reviewedAt || undefined,
          start: '',
          end: '',
        }
      : null;
  }

  async processAttendance(data: AttendanceData): Promise<Attendance> {
    const user = await prisma.user.findUnique({
      where: { id: data.employeeId },
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
      potentialOvertimes: [],
    };

    const checkTime = moment(data.checkTime);

    try {
      const now = moment().tz('Asia/Bangkok');
      const todayStart = moment(now).startOf('day');

      const shiftAdjustments = await this.getShiftAdjustments(
        user.employeeId,
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
              checkTime.isAfter(graceCheckInEnd),
          },
        );
      } else {
        return await this.processingService.processCheckOut(
          user.employeeId,
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

  async requestManualEntry(
    employeeId: string,
    date: Date,
    checkInTime: Date,
    checkOutTime: Date,
    reason: string,
  ): Promise<Attendance> {
    const user = await prisma.user.findUnique({ where: { id: employeeId } });
    if (!user) throw new Error('User not found');

    const manualEntry = await prisma.attendance.create({
      data: {
        employeeId,
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
      attendance.employeeId,
      `Your manual entry for ${attendance.date.toDateString()} has been approved.`,
    );

    return approvedAttendance;
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
      potentialOvertimes: user.potentialOvertimes,
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
    employeeId: string,
  ): Promise<Array<{ date: string; shift: ShiftData }>> {
    const tomorrow = moment().add(1, 'day').startOf('day');
    const twoWeeksLater = moment().add(2, 'weeks').endOf('day');

    const shiftAdjustments = await prisma.shiftAdjustmentRequest.findMany({
      where: {
        employeeId,
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
    employeeId: string,
  ): Promise<Array<ApprovedOvertime>> {
    const tomorrow = moment().add(1, 'day').startOf('day');
    const twoWeeksLater = moment().add(2, 'weeks').endOf('day');

    const overtimes = await prisma.overtimeRequest.findMany({
      where: {
        employeeId,
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

  async isWorkDay(
    userId: string,
    date: Date,
    weeklyWorkDays: Map<string, number>,
  ): Promise<boolean> {
    const isRegularWorkDay = await this.holidayService.isWorkingDay(
      userId,
      date,
    );

    if (isRegularWorkDay) {
      return true;
    }

    // If it's not a regular work day, check if we're under the weekly quota
    const weekStart = moment(date).startOf('week').format('YYYY-MM-DD');
    const workedDaysThisWeek = weeklyWorkDays.get(weekStart) || 0;

    return workedDaysThisWeek < 6;
  }

  async getWeeklyWorkDays(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Map<string, number>> {
    const attendances = await prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: 'present',
      },
    });

    const weeklyWorkDays = new Map<string, number>();
    attendances.forEach((attendance) => {
      const weekStart = moment(attendance.date)
        .startOf('week')
        .format('YYYY-MM-DD');
      weeklyWorkDays.set(weekStart, (weeklyWorkDays.get(weekStart) || 0) + 1);
    });

    return weeklyWorkDays;
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

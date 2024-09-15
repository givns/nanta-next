import {
  PrismaClient,
  Attendance,
  User,
  Shift,
  LeaveRequest,
} from '@prisma/client';
import { ShiftManagementService } from './ShiftManagementService';
import { HolidayService } from './HolidayService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import {
  parseISO,
  format,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  isBefore,
  isAfter,
  isSameDay,
} from 'date-fns';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ProcessedAttendance,
  ShiftData,
  ApprovedOvertime,
  AttendanceStatusValue,
  AttendanceStatusType,
} from '../types/attendance';
import { UserData } from '../types/user';
import { NotificationService } from './NotificationService';
import { UserRole } from '../types/enum';
import { TimeEntryService } from './TimeEntryService';

export class AttendanceService {
  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
    private holidayService: HolidayService,
    private leaveService: LeaveServiceServer,
    private overtimeService: OvertimeServiceServer,
    private notificationService: NotificationService,
    private timeEntryService: TimeEntryService,
  ) {}

  async processAttendance(
    attendanceData: AttendanceData,
  ): Promise<ProcessedAttendance> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId: attendanceData.employeeId },
      include: { department: true },
    });
    if (!user) throw new Error('User not found');

    const shift = await this.shiftManagementService.getUserShift(user.id);
    if (!shift) throw new Error('User shift not found');

    const { isCheckIn, checkTime } = attendanceData;
    const parsedCheckTime = parseISO(checkTime as string);
    const shiftStart = this.parseShiftTime(shift.startTime, parsedCheckTime);
    const shiftEnd = this.parseShiftTime(shift.endTime, parsedCheckTime);

    let status: AttendanceStatusValue = 'present';
    let detailedStatus: string = '';
    let isOvertime = false;

    const regularHours = this.calculateRegularHours(
      parsedCheckTime,
      shiftStart,
      shiftEnd,
      parsedCheckTime,
    );
    const overtimeHours = this.calculateOvertimeHours(
      parsedCheckTime,
      shiftEnd,
    );

    if (isCheckIn) {
      detailedStatus = this.determineCheckInStatus(
        parsedCheckTime,
        shiftStart,
        shiftEnd,
      );
    } else {
      detailedStatus = this.determineCheckOutStatus(
        parsedCheckTime,
        shiftStart,
        shiftEnd,
      );
      isOvertime = isAfter(parsedCheckTime, shiftEnd);
    }

    const processedAttendance: ProcessedAttendance = {
      id: '', // This will be set when saving to the database
      employeeId: user.employeeId,
      date: startOfDay(parsedCheckTime),
      checkIn: isCheckIn ? format(parsedCheckTime, 'HH:mm:ss') : undefined,
      checkOut: !isCheckIn ? format(parsedCheckTime, 'HH:mm:ss') : undefined,
      status,
      regularHours,
      overtimeHours,
      isOvertime,
      detailedStatus,
      overtimeDuration: overtimeHours,
      isEarlyCheckIn: isBefore(parsedCheckTime, shiftStart),
      isLateCheckIn: isAfter(parsedCheckTime, shiftStart),
      isLateCheckOut: isAfter(parsedCheckTime, shiftEnd),
      checkInDeviceSerial: attendanceData.deviceSerial,
      checkOutDeviceSerial: !isCheckIn ? attendanceData.deviceSerial : null,
      isManualEntry: false,
    };

    // Save the attendance record to the database
    const savedAttendance = await this.prisma.attendance.create({
      data: {
        employeeId: processedAttendance.employeeId,
        date: processedAttendance.date,
        checkInTime: isCheckIn ? parsedCheckTime : undefined,
        checkOutTime: !isCheckIn ? parsedCheckTime : undefined,
        status: processedAttendance.status,
        isOvertime: processedAttendance.isOvertime,
        overtimeDuration: processedAttendance.overtimeDuration,
        checkInDeviceSerial: processedAttendance.checkInDeviceSerial,
        checkOutDeviceSerial: processedAttendance.checkOutDeviceSerial,
        isManualEntry: processedAttendance.isManualEntry,
      },
    });
    await this.timeEntryService.createOrUpdateTimeEntry(savedAttendance);

    processedAttendance.id = savedAttendance.id;

    return processedAttendance;
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { department: true, assignedShift: true },
    });
    if (!user) throw new Error('User not found');

    const today = new Date();
    const latestAttendance = await this.getLatestAttendance(employeeId);

    const shift = user.assignedShift;
    if (!shift) throw new Error('User shift not found');

    const shiftData: ShiftData = {
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      workDays: shift.workDays,
      shiftCode: shift.shiftCode,
    };

    const isHoliday = await this.holidayService.isHoliday(today, [], false);
    const leaveRequest = await this.leaveService.getLeaveRequests(employeeId);
    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(employeeId, today);
    const futureShifts = await this.shiftManagementService.getFutureShifts(
      employeeId,
      today,
    );
    const futureOvertimes =
      await this.overtimeService.getFutureApprovedOvertimes(employeeId, today);

    const userData: UserData = {
      employeeId: user.employeeId,
      name: user.name,
      lineUserId: user.lineUserId,
      nickname: user.nickname,
      departmentId: user.departmentId,
      department: user.department?.name ?? 'Unassigned',
      role: user.role as UserRole,
      profilePictureUrl: user.profilePictureUrl,
      shiftId: shift.id,
      assignedShift: shiftData,
      overtimeHours: user.overtimeHours,
      potentialOvertimes: [],
      sickLeaveBalance: user.sickLeaveBalance,
      businessLeaveBalance: user.businessLeaveBalance,
      annualLeaveBalance: user.annualLeaveBalance,
      createdAt: user.createdAt ?? new Date(),
      updatedAt: user.updatedAt ?? new Date(),
    };

    return this.determineAttendanceStatus(
      userData,
      latestAttendance,
      shiftData,
      today,
      isHoliday,
      leaveRequest[0],
      approvedOvertime,
      futureShifts,
      futureOvertimes,
    );
  }

  async getAttendanceHistory(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ProcessedAttendance[]> {
    const attendances = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        date: {
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
        },
      },
      orderBy: { date: 'asc' },
    });

    const user = await this.prisma.user.findUnique({
      where: { employeeId },
      include: { department: true },
    });
    if (!user) throw new Error('User not found');

    const shift = await this.shiftManagementService.getUserShift(user.id);
    if (!shift) throw new Error('User shift not found');

    const holidays = await this.holidayService.getHolidays(startDate, endDate);
    const leaveRequests = await this.leaveService.getLeaveRequests(employeeId);
    const approvedOvertimes =
      await this.overtimeService.getApprovedOvertimesInRange(
        employeeId,
        startDate,
        endDate,
      );

    return this.processAttendanceHistory(
      attendances,
      user,
      shift,
      holidays,
      leaveRequests,
      approvedOvertimes,
    );
  }

  private determineAttendanceStatus(
    user: UserData,
    attendance: Attendance | null,
    shift: ShiftData,
    now: Date,
    isHoliday: boolean,
    leaveRequest: LeaveRequest | null,
    approvedOvertime: ApprovedOvertime | null,
    futureShifts: Array<{ date: string; shift: ShiftData }>,
    futureOvertimes: Array<ApprovedOvertime>,
  ): AttendanceStatusInfo {
    const shiftStart = this.parseShiftTime(shift.startTime, now);
    const shiftEnd = this.parseShiftTime(shift.endTime, now);

    let status: AttendanceStatusValue = 'absent';
    let isCheckingIn = true;
    let detailedStatus = '';
    let isOvertime = false;
    let overtimeDuration = 0;

    if (isHoliday) {
      status = 'holiday';
      isCheckingIn = false;
    } else if (leaveRequest) {
      status = 'off';
      isCheckingIn = false;
    } else if (!attendance) {
      status = isBefore(now, shiftStart) ? 'absent' : 'incomplete';
    } else {
      if (!attendance.checkOutTime) {
        status = 'present';
        isCheckingIn = false;
        detailedStatus = 'checked-in';
      } else {
        status = 'present';
        detailedStatus = 'checked-out';
        isCheckingIn = isAfter(now, endOfDay(attendance.date));

        if (isAfter(attendance.checkOutTime, shiftEnd)) {
          isOvertime = true;
          overtimeDuration =
            differenceInMinutes(attendance.checkOutTime, shiftEnd) / 60;
        }
      }
    }

    if (approvedOvertime && isSameDay(now, approvedOvertime.date)) {
      isOvertime = true;
      overtimeDuration =
        differenceInMinutes(
          parseISO(approvedOvertime.endTime),
          parseISO(approvedOvertime.startTime),
        ) / 60;
    }

    return {
      status,
      isOvertime,
      overtimeDuration,
      detailedStatus,
      isEarlyCheckIn: attendance?.isEarlyCheckIn ?? undefined,
      isLateCheckIn: attendance?.isLateCheckIn ?? undefined,
      isLateCheckOut: attendance?.isLateCheckOut ?? undefined,
      user,
      latestAttendance: attendance
        ? {
            id: attendance.id,
            employeeId: attendance.employeeId,
            date: format(attendance.date, 'yyyy-MM-dd'),
            checkInTime: attendance.checkInTime
              ? format(attendance.checkInTime, 'HH:mm:ss')
              : null,
            checkOutTime: attendance.checkOutTime
              ? format(attendance.checkOutTime, 'HH:mm:ss')
              : null,
            checkInDeviceSerial: attendance.checkInDeviceSerial || '',
            checkOutDeviceSerial: attendance.checkOutDeviceSerial || null,
            status: this.mapStatusToAttendanceStatusType(status),
            isManualEntry: attendance.isManualEntry,
          }
        : null,
      isCheckingIn,
      isDayOff: status === 'holiday' || status === 'off',
      potentialOvertimes: user.potentialOvertimes,
      shiftAdjustment: null, // Implement if needed
      approvedOvertime,
      futureShifts,
      futureOvertimes,
    };
  }

  private processAttendanceHistory(
    attendances: Attendance[],
    user: User,
    shift: Shift,
    holidays: { date: Date }[],
    leaveRequests: LeaveRequest[],
    overtimeRequests: ApprovedOvertime[],
  ): ProcessedAttendance[] {
    return attendances.map((attendance) => {
      const processedAttendance = this.processAttendanceRecord(
        attendance,
        shift,
      );
      const date = startOfDay(attendance.date);
      const isHoliday = holidays.some((holiday) =>
        isSameDay(holiday.date, date),
      );
      const leaveRequest = leaveRequests.find((leave) =>
        isSameDay(parseISO(leave.startDate.toString()), date),
      );
      const overtimeRequest = overtimeRequests.find((ot) =>
        isSameDay(ot.date, date),
      );

      let status: AttendanceStatusValue = processedAttendance.status;
      if (isHoliday) {
        status = 'holiday';
      } else if (leaveRequest) {
        status = 'off';
      }

      return {
        ...processedAttendance,
        status,
        isOvertime: !!overtimeRequest,
        overtimeHours: overtimeRequest
          ? this.calculateOvertimeHours(
              parseISO(overtimeRequest.endTime),
              parseISO(overtimeRequest.startTime),
            )
          : 0,
        detailedStatus: this.generateDetailedStatus(
          status,
          processedAttendance.isEarlyCheckIn,
          processedAttendance.isLateCheckIn,
          processedAttendance.isLateCheckOut,
        ),
      };
    });
  }

  private processAttendanceRecord(
    attendance: Attendance,
    shift: Shift,
  ): ProcessedAttendance {
    const shiftStart = this.parseShiftTime(shift.startTime, attendance.date);
    const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);

    const regularHours = this.calculateRegularHours(
      attendance.checkInTime || new Date(),
      attendance.checkOutTime || new Date(),
      shiftStart,
      shiftEnd,
    );
    const overtimeHours = attendance.checkOutTime
      ? this.calculateOvertimeHours(attendance.checkOutTime, shiftEnd)
      : 0;

    const status = this.calculateAttendanceStatus(attendance, shift);

    return {
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: attendance.date,
      checkIn: attendance.checkInTime
        ? format(attendance.checkInTime, 'HH:mm:ss')
        : undefined,
      checkOut: attendance.checkOutTime
        ? format(attendance.checkOutTime, 'HH:mm:ss')
        : undefined,
      status,
      regularHours,
      overtimeHours,
      isOvertime: overtimeHours > 0,
      detailedStatus: this.generateDetailedStatus(status),
      overtimeDuration: overtimeHours,
      isEarlyCheckIn: attendance.checkInTime
        ? isBefore(attendance.checkInTime, shiftStart)
        : false,
      isLateCheckIn: attendance.checkInTime
        ? isAfter(attendance.checkInTime, shiftStart)
        : false,
      isLateCheckOut: attendance.checkOutTime
        ? isAfter(attendance.checkOutTime, shiftEnd)
        : false,
      checkInDeviceSerial: attendance.checkInDeviceSerial,
      checkOutDeviceSerial: attendance.checkOutDeviceSerial,
      isManualEntry: attendance.isManualEntry,
    };
  }

  private parseShiftTime(timeString: string, referenceDate: Date): Date {
    const [hours, minutes] = timeString.split(':').map(Number);
    const shiftTime = new Date(referenceDate);
    shiftTime.setHours(hours, minutes, 0, 0);
    return shiftTime;
  }

  private determineCheckInStatus(
    checkTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): string {
    if (isBefore(checkTime, shiftStart)) return 'early-check-in';
    if (isAfter(checkTime, shiftStart) && isBefore(checkTime, shiftEnd))
      return 'on-time';
    return 'late-check-in';
  }

  private determineCheckOutStatus(
    checkTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): string {
    if (isBefore(checkTime, shiftEnd)) return 'early-leave';
    if (isAfter(checkTime, shiftEnd)) return 'overtime';
    return 'on-time';
  }

  private calculateRegularHours(
    checkInTime: Date,
    checkOutTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): number {
    const effectiveStart = isAfter(checkInTime, shiftStart)
      ? checkInTime
      : shiftStart;
    const effectiveEnd = isBefore(checkOutTime, shiftEnd)
      ? checkOutTime
      : shiftEnd;
    return Math.max(0, differenceInMinutes(effectiveEnd, effectiveStart) / 60);
  }

  private calculateOvertimeHours(checkOutTime: Date, shiftEnd: Date): number {
    if (isAfter(checkOutTime, shiftEnd)) {
      return differenceInMinutes(checkOutTime, shiftEnd) / 60;
    }
    return 0;
  }

  private mapStatusToAttendanceStatusType(
    status: AttendanceStatusValue,
  ): AttendanceStatusType {
    switch (status) {
      case 'present':
        return 'checked-out';
      case 'incomplete':
        return 'checked-in';
      case 'absent':
        return 'pending';
      case 'holiday':
      case 'off':
        return 'approved';
      default:
        return 'pending';
    }
  }

  private generateDetailedStatus(
    status: AttendanceStatusValue,
    isEarlyCheckIn?: boolean,
    isLateCheckIn?: boolean,
    isLateCheckOut?: boolean,
  ): string {
    if (status !== 'present') return status;

    const details: string[] = [];
    if (isEarlyCheckIn) details.push('early-check-in');
    if (isLateCheckIn) details.push('late-check-in');
    if (isLateCheckOut) details.push('late-check-out');

    return details.length > 0 ? details.join('-') : 'on-time';
  }

  async getLatestAttendance(employeeId: string): Promise<Attendance | null> {
    return this.prisma.attendance.findFirst({
      where: { employeeId },
      orderBy: { date: 'desc' },
    });
  }

  async checkMissingAttendance() {
    const now = new Date();
    const users = await this.prisma.user.findMany({
      where: {
        assignedShift: {
          startTime: { lte: format(now, 'HH:mm:ss') },
          endTime: { gte: format(now, 'HH:mm:ss') },
        },
      },
      include: { attendances: { where: { date: now } } },
    });

    for (const user of users) {
      if (user.attendances.length === 0) {
        if (user.lineUserId) {
          await this.notificationService.sendMissingCheckInNotification(
            user.lineUserId,
          );
        }
      }
    }
  }

  private calculateAttendanceStatus(
    attendance: Attendance,
    shift: Shift,
  ): AttendanceStatusValue {
    const shiftStart = this.parseShiftTime(shift.startTime, attendance.date);
    const shiftEnd = this.parseShiftTime(shift.endTime, attendance.date);

    if (!attendance.checkInTime) return 'absent';
    if (!attendance.checkOutTime) return 'incomplete';
    if (isAfter(attendance.checkOutTime, shiftEnd)) return 'present';
    if (isBefore(attendance.checkOutTime, shiftEnd)) return 'incomplete';
    return 'present';
  }
}

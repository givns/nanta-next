// AttendanceProcessingService.ts

import {
  PrismaClient,
  User,
  Shift,
  LeaveRequest,
  NoWorkDay,
  Holiday,
} from '@prisma/client';
import {
  differenceInMinutes,
  parseISO,
  format,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay,
  isSameDay,
} from 'date-fns';
import { UserData } from '../types/user';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ProcessedAttendance,
  AttendanceStatusValue,
  ShiftData,
  ApprovedOvertime,
  AttendanceStatusType,
} from '../types/attendance';
import { ShiftManagementService } from './ShiftManagementService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { NoWorkDayService } from './NoWorkDayService';
import { HolidayService } from './HolidayService';

export class AttendanceProcessingService {
  constructor(
    private prisma: PrismaClient,
    private shiftManagementService: ShiftManagementService,
    private leaveService: LeaveServiceServer,
    private overtimeService: OvertimeServiceServer,
    private noWorkDayService: NoWorkDayService,
    private holidayService: HolidayService,
  ) {}

  async processAttendance(
    attendanceData: AttendanceData,
    user: User,
    shiftType: 'regular' | 'shift104' = 'regular',
  ): Promise<ProcessedAttendance> {
    const { isCheckIn, checkTime } = attendanceData;
    const parsedCheckTime = parseISO(checkTime as string);
    const date = startOfDay(parsedCheckTime);

    const shift = await this.getEffectiveShift(user.id, date);
    const shiftStart = shift
      ? this.parseShiftTime(shift.startTime, parsedCheckTime)
      : null;
    const shiftEnd = shift
      ? this.parseShiftTime(shift.endTime, parsedCheckTime)
      : null;

    const userShift = await this.shiftManagementService.getUserShift(user.id);
    const isShift104 = userShift?.shiftCode === 'SHIFT104';

    // Fetch holidays for the entire year to reduce database queries
    const year = parsedCheckTime.getFullYear();
    const holidays = await this.holidayService.getHolidaysForYear(
      year,
      shiftType,
    );

    const isHoliday = this.holidayService.isHoliday(date, holidays, isShift104);
    const isNoWorkDay = await this.noWorkDayService.isNoWorkDay(date, user.id);
    const leaveRequest = await this.leaveService.getLeaveRequestForDate(
      user.id,
      date,
    );
    const approvedOvertime =
      await this.overtimeService.getApprovedOvertimeRequest(user.id, date);

    let status: AttendanceStatusValue = 'present';
    let detailedStatus: string;
    let isOvertime = false;
    let overtimeMinutes = 0;

    if (isHoliday || isNoWorkDay) {
      status = 'holiday';
      detailedStatus = isHoliday ? 'holiday' : 'no-work-day';
    } else if (leaveRequest && leaveRequest.status === 'Approved') {
      status = 'off';
      detailedStatus = 'approved-leave';
    } else {
      if (isCheckIn) {
        detailedStatus = this.determineCheckInStatus(
          parsedCheckTime,
          shiftStart || new Date(), // Provide a default value for shiftStart
          shiftEnd || new Date(), // Provide a default value for shiftEnd
        );
      } else {
        [detailedStatus, isOvertime, overtimeMinutes] =
          this.determineCheckOutStatus(
            parsedCheckTime,
            shiftStart || new Date(), // Provide a default value for shiftStart
            shiftEnd || new Date(), // Provide a default value for shiftEnd
            approvedOvertime,
          );
      }
    }

    const regularHours = this.calculateRegularHours(
      parsedCheckTime,
      shiftStart || new Date(), // Provide a default value for shiftStart
      shiftEnd || new Date(), // Provide a default value for shiftEnd
    );
    const overtimeHours = overtimeMinutes / 60;

    return {
      id: '',
      employeeId: user.id,
      date,
      checkIn: isCheckIn ? format(parsedCheckTime, 'HH:mm:ss') : undefined,
      checkOut: !isCheckIn ? format(parsedCheckTime, 'HH:mm:ss') : undefined,
      status,
      regularHours,
      overtimeHours,
      isOvertime,
      detailedStatus,
      overtimeDuration: overtimeHours,
      isEarlyCheckIn: isBefore(parsedCheckTime, shiftStart || new Date()),
      isLateCheckIn: isAfter(parsedCheckTime, shiftStart || new Date()),
      isLateCheckOut: isAfter(parsedCheckTime, shiftEnd || new Date()),
      isManualEntry: false,
      attendanceStatusType: this.mapStatusToAttendanceStatusType(status),
    };
  }

  private async getShiftForUser(userData: UserData): Promise<Shift | null> {
    if (!userData.shiftCode) {
      console.warn(`No shift code found for user ${userData.employeeId}`);
      return null;
    }
    return this.shiftManagementService.getShiftByCode(userData.shiftCode);
  }

  private async getEffectiveShift(
    userId: string,
    date: Date,
  ): Promise<ShiftData> {
    const shiftAdjustment =
      await this.shiftManagementService.getShiftAdjustmentForDate(userId, date);
    if (shiftAdjustment && shiftAdjustment.status === 'approved') {
      return shiftAdjustment.requestedShift;
    }
    const userShift = await this.shiftManagementService.getUserShift(userId);
    if (!userShift) {
      throw new Error(`No shift found for user ${userId}`);
    }
    return userShift;
  }

  private determineCheckOutStatus(
    checkTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
    approvedOvertime: ApprovedOvertime | null,
  ): [string, boolean, number] {
    if (isBefore(checkTime, shiftEnd)) {
      return ['early-leave', false, 0];
    }

    if (approvedOvertime) {
      const overtimeStart = parseISO(approvedOvertime.startTime);
      const overtimeEnd = parseISO(approvedOvertime.endTime);
      if (
        isAfter(checkTime, overtimeStart) &&
        isBefore(checkTime, overtimeEnd)
      ) {
        const overtimeMinutes = this.calculateOvertimeMinutes(
          checkTime,
          overtimeStart,
        );
        return ['approved-overtime', true, overtimeMinutes];
      }
    }

    const potentialOvertimeMinutes = this.calculateOvertimeMinutes(
      checkTime,
      shiftEnd,
    );
    return ['potential-overtime', true, potentialOvertimeMinutes];
  }

  private calculateOvertimeMinutes(endTime: Date, startTime: Date): number {
    const totalMinutes = differenceInMinutes(endTime, startTime);
    return Math.floor(totalMinutes / 30) * 30; // Round down to nearest 30 minutes
  }

  determineAttendanceStatus(
    user: UserData,
    latestAttendance: ProcessedAttendance | null,
    shift: ShiftData,
    isHoliday: boolean,
    leaveRequest: LeaveRequest | null,
    approvedOvertime: ApprovedOvertime | null,
  ): AttendanceStatusInfo {
    const now = new Date();
    const shiftStart = shift ? this.parseShiftTime(shift.startTime, now) : null;
    const shiftEnd = shift ? this.parseShiftTime(shift.endTime, now) : null;

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
    } else if (!latestAttendance) {
      status = isBefore(now, shiftStart || new Date())
        ? 'absent'
        : 'incomplete';
    } else if (!latestAttendance.checkOut) {
      status = 'present';
      isCheckingIn = false;
      detailedStatus = 'checked-in';
    } else {
      status = 'present';
      detailedStatus = 'checked-out';
      isCheckingIn = isAfter(now, endOfDay(latestAttendance.date));
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
      isEarlyCheckIn: latestAttendance?.isEarlyCheckIn || false,
      isLateCheckIn: latestAttendance?.isLateCheckIn ?? false,
      isLateCheckOut: latestAttendance?.isLateCheckOut || false,
      user,
      latestAttendance: latestAttendance
        ? {
            id: latestAttendance.id,
            employeeId: latestAttendance.employeeId,
            date: format(latestAttendance.date, 'yyyy-MM-dd'),
            checkInTime: latestAttendance.checkIn || null,
            checkOutTime: latestAttendance.checkOut || null,
            status: this.mapStatusToAttendanceStatusType(
              latestAttendance.status,
            ),
            isManualEntry: latestAttendance.isManualEntry,
          }
        : null,
      isCheckingIn,
      isDayOff: status === 'holiday' || status === 'off',
      potentialOvertimes: user.potentialOvertimes,
      shiftAdjustment: null, // This would need to be implemented if shift adjustments are still needed
      approvedOvertime,
      futureShifts: [], // This would need to be implemented if future shifts are still needed
      futureOvertimes: [], // This would need to be implemented if future overtimes are still needed
      pendingLeaveRequest: false, // This would need to be implemented if pending leave requests are still
    };
  }

  async processAttendanceHistory(
    attendances: ProcessedAttendance[],
    userData: UserData,
    holidays: Date[],
    leaveRequests: LeaveRequest[],
    overtimeRequests: ApprovedOvertime[],
  ): Promise<ProcessedAttendance[]> {
    const shift = await this.getShiftForUser(userData);
    if (!shift) {
      console.warn(`No shift found for user ${userData.employeeId}`);
      return [];
    }
    return attendances.map((attendance) => {
      const date = startOfDay(attendance.date);
      const isHoliday = holidays.some((holiday) => isSameDay(holiday, date));
      const leaveRequest = leaveRequests.find((leave) =>
        isSameDay(parseISO(leave.startDate.toString()), date),
      );
      const overtimeRequest = overtimeRequests.find((ot) =>
        isSameDay(ot.date, date),
      );

      let status: AttendanceStatusValue = attendance.status;
      if (isHoliday) {
        status = 'holiday';
      } else if (leaveRequest) {
        status = 'off';
      } else if (!attendance.checkIn && !attendance.checkOut) {
        status = 'absent';
      } else if (attendance.checkIn && attendance.checkOut) {
        status = 'present';
      } else {
        status = 'incomplete';
      }

      const regularHours = this.calculateRegularHours(
        parseISO(attendance.checkIn || ''),
        this.parseShiftTime(shift?.startTime ?? '00:00', date),
        this.parseShiftTime(shift?.endTime ?? '00:00', date),
      );

      const overtimeHours = overtimeRequest
        ? this.calculateOvertimeHours(
            parseISO(overtimeRequest.endTime),
            parseISO(overtimeRequest.startTime),
          )
        : 0;

      return {
        ...attendance,
        status,
        regularHours,
        overtimeHours,
        isOvertime: !!overtimeRequest,
        overtimeDuration: overtimeHours,
        detailedStatus: this.generateDetailedStatus(
          status,
          attendance.isEarlyCheckIn,
          attendance.isLateCheckIn,
          attendance.isLateCheckOut,
        ),
      };
    });
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

  private calculateRegularHours(
    checkInTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): number {
    if (!checkInTime) return 0;
    const effectiveStart = isAfter(checkInTime, shiftStart)
      ? checkInTime
      : shiftStart;
    const effectiveEnd = isBefore(checkInTime, shiftEnd)
      ? checkInTime
      : shiftEnd;
    return Math.max(0, differenceInMinutes(effectiveEnd, effectiveStart) / 60);
  }

  private calculateOvertimeHours(endTime: Date, startTime: Date): number {
    return Math.max(0, differenceInMinutes(endTime, startTime) / 60);
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
}

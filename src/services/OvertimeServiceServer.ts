// services/OvertimeServiceServer.ts
import {
  PrismaClient,
  OvertimeRequest,
  Prisma,
  OvertimeEntry,
} from '@prisma/client';
import { IOvertimeServiceServer } from '../types/OvertimeService';
import { TimeEntryService } from './TimeEntryService';
import {
  parseISO,
  format,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  addDays,
  parse,
  addMinutes,
  isBefore,
  isAfter,
  subMinutes,
  isWithinInterval,
} from 'date-fns';
import { NotificationService } from './NotificationService';
import { th } from 'date-fns/locale';
import { HolidayService } from './HolidayService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { getCurrentTime } from '../utils/dateUtils';
import {
  ApprovedOvertimeInfo,
  CheckStatus,
  OvertimeAttendanceInfo,
  OvertimeRequestStatus,
  OvertimeState,
} from '../types/attendance/status';
import { TimeCalculationHelper } from './Attendance/utils/TimeCalculationHelper';
import { ATTENDANCE_CONSTANTS, AttendanceRecord } from '../types/attendance';
import {
  ExtendedApprovedOvertime,
  OvertimeEntryData,
} from '../types/attendance/overtime';

export class OvertimeServiceServer implements IOvertimeServiceServer {
  constructor(
    private prisma: PrismaClient,
    private holidayService: HolidayService,
    private leaveService: LeaveServiceServer,
    private shiftService: ShiftManagementService,
    private timeEntryService: TimeEntryService,
    private notificationService: NotificationService,
  ) {}

  async createOvertimeRequest(
    lineUserId: string,
    date: string,
    startTime: string,
    endTime: string,
    reason: string,
  ): Promise<OvertimeRequest> {
    const user = await this.prisma.user.findUnique({
      where: { lineUserId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isDayOff = await this.isDayOffForEmployee(
      user.employeeId,
      parseISO(date),
    );

    const overtimeRequestData: Prisma.OvertimeRequestCreateInput = {
      user: { connect: { id: user.id } },
      name: user.name,
      date: parseISO(date),
      startTime,
      endTime,
      status: 'pending_response',
      employeeResponse: null,
      reason,
      isDayOffOvertime: isDayOff,
    };

    const newOvertimeRequest = await this.prisma.overtimeRequest.create({
      data: overtimeRequestData,
      include: { user: true },
    });

    if (user.lineUserId) {
      await this.notificationService.sendOvertimeRequestNotification(
        newOvertimeRequest,
        user.employeeId,
        user.lineUserId,
      );
    }

    return newOvertimeRequest;
  }

  private async isDayOffForEmployee(
    employeeId: string,
    date: Date,
  ): Promise<boolean> {
    const shift = await this.shiftService.getEffectiveShiftAndStatus(
      employeeId,
      date,
    );
    if (!shift) return true;

    const isHoliday = await this.holidayService.isHoliday(
      date,
      [],
      shift.effectiveShift?.shiftCode === 'SHIFT104',
    );
    if (isHoliday) return true;

    const dayOfWeek = date.getDay();
    if (!shift.effectiveShift?.workDays.includes(dayOfWeek)) return true;

    const leave = await this.leaveService.checkUserOnLeave(employeeId, date);
    if (leave) return true;

    return false;
  }

  async updateOvertimeActualStartTime(
    requestId: string,
    actualStartTime: Date,
  ): Promise<OvertimeRequest> {
    const overtimeRequest = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!overtimeRequest) {
      throw new Error('Overtime request not found');
    }

    // Creating associated overtime entry instead of updating request
    const overtimeEntry = await this.prisma.overtimeEntry.create({
      data: {
        overtimeRequestId: requestId,
        attendanceId: overtimeRequest.id, // Assumes there's an attendance record
        actualStartTime: actualStartTime,
      },
    });

    return overtimeRequest;
  }

  async updateOvertimeActualEndTime(
    requestId: string,
    actualEndTime: Date,
  ): Promise<OvertimeRequest> {
    const overtimeRequest = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: { overtimeEntries: true },
    });

    if (!overtimeRequest) {
      throw new Error('Overtime request not found');
    }

    // Find the most recent overtime entry and update it
    const mostRecentEntry = overtimeRequest.overtimeEntries[0];
    if (mostRecentEntry) {
      await this.prisma.overtimeEntry.update({
        where: { id: mostRecentEntry.id },
        data: { actualEndTime },
      });
    }

    return overtimeRequest;
  }

  async processOvertimeCheckInOut(
    attendance: AttendanceRecord,
    timestamp: Date,
    isCheckIn: boolean,
  ): Promise<void> {
    const overtimeRequest = await this.getCurrentApprovedOvertimeRequest(
      attendance.employeeId,
      timestamp,
    );

    if (!overtimeRequest) {
      throw new Error('No approved overtime request found for this time.');
    }

    const allowedStartTime = addMinutes(
      parseISO(overtimeRequest.startTime),
      -15,
    );
    const allowedEndTime = addMinutes(parseISO(overtimeRequest.endTime), 15);

    if (!this.isWithinTimeWindow(timestamp, allowedStartTime, allowedEndTime)) {
      throw new Error(
        'Check-in/out time is outside the allowed 15-minute window for overtime.',
      );
    }

    await this.createOvertimeEntry({
      attendanceId: attendance.id,
      overtimeRequestId: overtimeRequest.id,
      timestamp,
      isCheckIn,
    });
  }

  private isWithinTimeWindow(
    timestamp: Date,
    startTime: Date,
    endTime: Date,
  ): boolean {
    return timestamp >= startTime && timestamp <= endTime;
  }

  private async createOvertimeEntry(data: {
    attendanceId: string;
    overtimeRequestId: string;
    timestamp: Date;
    isCheckIn: boolean;
  }): Promise<OvertimeEntry> {
    const entryData: Prisma.OvertimeEntryCreateInput = {
      attendance: { connect: { id: data.attendanceId } },
      overtimeRequest: { connect: { id: data.overtimeRequestId } },
      actualStartTime: data.isCheckIn ? data.timestamp : new Date(),
      actualEndTime: data.isCheckIn ? null : data.timestamp,
    };

    return this.prisma.overtimeEntry.create({
      data: entryData,
    });
  }

  async getOvertimeEntriesForAttendance(
    attendanceId: string,
  ): Promise<OvertimeEntryData[]> {
    const entries = await this.prisma.overtimeEntry.findMany({
      where: { attendanceId },
      include: {
        // Include overtime request to get these fields
        overtimeRequest: {
          select: {
            isDayOffOvertime: true,
            isInsideShiftHours: true,
          },
        },
      },
    });

    return entries.map((entry) => ({
      id: entry.id,
      attendanceId: entry.attendanceId,
      overtimeRequestId: entry.overtimeRequestId,
      actualStartTime: entry.actualStartTime,
      actualEndTime: entry.actualEndTime,
      isDayOffOvertime: entry.overtimeRequest?.isDayOffOvertime ?? false,
      isInsideShiftHours: entry.overtimeRequest?.isInsideShiftHours ?? false,
      createdAt: new Date(), // Added as per OvertimeEntryData interface
      updatedAt: new Date(), // Added as per OvertimeEntryData interface
    }));
  }

  async calculateTotalOvertimeHours(attendanceId: string): Promise<number> {
    const overtimeEntries =
      await this.getOvertimeEntriesForAttendance(attendanceId);

    return overtimeEntries.reduce((total, entry) => {
      if (entry.actualStartTime && entry.actualEndTime) {
        const durationInMinutes = differenceInMinutes(
          entry.actualEndTime,
          entry.actualStartTime,
        );
        return total + Math.floor(durationInMinutes / 30) * 0.5; // Round to nearest 30 minutes
      }
      return total;
    }, 0);
  }

  async getCurrentApprovedOvertimeRequest(
    employeeId: string,
    checkTime: Date,
  ): Promise<ApprovedOvertimeInfo | null> {
    if (process.env.NODE_ENV === 'test') return null;

    const currentTimeStr = format(checkTime, 'HH:mm');
    const overtimeDate = format(checkTime, 'yyyy-MM-dd');

    // First get any approved overtime for the day
    const overtimeRequest = await this.prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: startOfDay(checkTime),
        status: 'approved',
        employeeResponse: 'approve',
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        isInsideShiftHours: true,
        isDayOffOvertime: true,
        durationMinutes: true,
        status: true,
        employeeResponse: true,
      },
    });

    if (!overtimeRequest) return null;

    // Then check if current time is within window including early check-in
    const startDateTime = subMinutes(
      parseISO(`${overtimeDate}T${overtimeRequest.startTime}`),
      ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
    );
    let endDateTime = addMinutes(
      parseISO(`${overtimeDate}T${overtimeRequest.endTime}`),
      ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
    );

    // Handle overnight case
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    return {
      ...overtimeRequest,
      employeeId,
      date: checkTime,
      status: 'approved' as const,
      employeeResponse: 'approve' as const,
      reason: '',
      approverId: '',
    };
  }

  isInOvertimeWindow(checkTime: Date, overtime: ApprovedOvertimeInfo): boolean {
    const overtimeDate = format(checkTime, 'yyyy-MM-dd');
    const startDateTime = subMinutes(
      parseISO(`${overtimeDate}T${overtime.startTime}`),
      ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
    );
    let endDateTime = addMinutes(
      parseISO(`${overtimeDate}T${overtime.endTime}`),
      ATTENDANCE_CONSTANTS.LATE_CHECK_OUT_THRESHOLD,
    );

    // Handle overnight case
    if (isBefore(endDateTime, startDateTime)) {
      endDateTime = addDays(endDateTime, 1);
    }

    return isWithinInterval(checkTime, {
      start: startDateTime,
      end: endDateTime,
    });
  }

  async employeeRespondToOvertimeRequest(
    requestId: string,
    employeeId: string,
    response: 'approve' | 'deny',
  ): Promise<{ updatedRequest: OvertimeRequest; message: string }> {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new Error('Overtime request not found');
    }

    if (request.employeeId !== employeeId) {
      throw new Error('Unauthorized to respond to this request');
    }

    if (request.employeeResponse) {
      throw new Error('You have already responded to this overtime request');
    }

    let newStatus = response === 'approve' ? 'pending' : 'declined_by_employee';
    let updatedRequest;
    let isAutoApproved = false;
    let message = '';

    if (response === 'approve') {
      const overtimeDuration = this.calculateOvertimeDuration(
        request.startTime,
        request.endTime,
      );
      if (overtimeDuration <= 60) {
        // 60 minutes or less
        const result = await this.autoApproveOvertimeRequest(requestId);
        updatedRequest = result.updatedRequest;
        message = result.message;
        isAutoApproved = true;
      } else {
        updatedRequest = await this.prisma.overtimeRequest.update({
          where: { id: requestId },
          data: {
            employeeResponse: response,
            status: newStatus,
          },
        });
        message = `คุณได้ยืนยันการทำงานล่วงเวลาสำหรับวันที่ ${format(request.date, 'dd MMMM yyyy', { locale: th })} เวลา ${request.startTime} - ${request.endTime} แล้ว กรุณารอการอนุมัติจากผู้บังคับบัญชา`;
      }
    } else {
      updatedRequest = await this.prisma.overtimeRequest.update({
        where: { id: requestId },
        data: {
          employeeResponse: response,
          status: newStatus,
        },
      });
      message = `คุณได้ปฏิเสธการทำงานล่วงเวลาสำหรับวันที่ ${format(request.date, 'dd MMMM yyyy', { locale: th })} เวลา ${request.startTime} - ${request.endTime} แล้ว`;
    }

    // Notify admins
    let adminMessage: string;
    if (isAutoApproved) {
      adminMessage = `${request.user.name} ได้รับการอนุมัติทำงานล่วงเวลาโดยอัตโนมัติสำหรับวันที่ ${format(request.date, 'dd MMMM yyyy', { locale: th })} เวลา ${request.startTime} - ${request.endTime}`;
    } else if (response === 'approve') {
      adminMessage = `${request.user.name} ได้ยืนยันการทำงานล่วงเวลาสำหรับวันที่ ${format(request.date, 'dd MMMM yyyy', { locale: th })} เวลา ${request.startTime} - ${request.endTime} กรุณาตรวจสอบและอนุมัติ`;
    } else {
      adminMessage = `${request.user.name} ไม่ขอทำงานล่วงเวลาสำหรับวันที่ ${format(request.date, 'dd MMMM yyyy', { locale: th })} เวลา ${request.startTime} - ${request.endTime}`;
    }

    await this.notifyAdmins(adminMessage, 'overtime');
    console.log('Sending admin notification:', adminMessage);
    console.log('Sending employee notification:', message);

    // Notify employee
    if (request.user.lineUserId) {
      const employeeMessage = {
        type: 'text',
        text: message,
      };
      await this.notificationService.sendNotification(
        request.employeeId,
        request.user.lineUserId,
        JSON.stringify(employeeMessage),
        'overtime',
      );
    }

    return { updatedRequest, message };
  }

  private async autoApproveOvertimeRequest(
    requestId: string,
  ): Promise<{ updatedRequest: OvertimeRequest; message: string }> {
    const approvedRequest = await this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        employeeResponse: 'approve',
      },
      include: {
        user: {
          select: {
            id: true,
            employeeId: true,
            lineUserId: true,
            name: true,
          },
        },
      },
    });

    const message = `คำขอทำงานล่วงเวลาของคุณสำหรับวันที่ ${format(approvedRequest.date, 'dd MMMM yyyy', { locale: th })} เวลา ${approvedRequest.startTime} - ${approvedRequest.endTime} ได้รับการอนุมัติโดยอัตโนมัติ`;

    return { updatedRequest: approvedRequest, message };
  }

  private calculateOvertimeDuration(
    startTime: string,
    endTime: string,
  ): number {
    const start = parse(startTime, 'HH:mm', new Date());
    const end = parse(endTime, 'HH:mm', new Date());
    return differenceInMinutes(end, start);
  }

  async getFutureApprovedOvertimes(
    employeeId: string,
    startDate: Date,
  ): Promise<ApprovedOvertimeInfo[]> {
    const tomorrow = addDays(startOfDay(startDate), 1);

    const futureOvertimes = await this.prisma.overtimeRequest.findMany({
      where: {
        employeeId,
        date: { gte: tomorrow },
        status: 'approved',
      },
      orderBy: { date: 'asc' },
    });

    return futureOvertimes.map(this.convertToApprovedOvertime);
  }

  private convertToApprovedOvertime(
    overtime: OvertimeRequest,
  ): ApprovedOvertimeInfo {
    // Helper function to map OvertimeRequest status to ApprovedOvertime status
    const status: OvertimeRequestStatus =
      overtime.status as OvertimeRequestStatus;

    return {
      id: overtime.id,
      employeeId: overtime.employeeId,
      date: overtime.date,
      startTime: overtime.startTime,
      endTime: overtime.endTime,
      durationMinutes: overtime.durationMinutes,
      status: status,
      employeeResponse: overtime.employeeResponse,
      reason: overtime.reason,
      approverId: overtime.approverId,
      isDayOffOvertime: overtime.isDayOffOvertime,
      isInsideShiftHours: overtime.isInsideShiftHours,
    };
  }

  async adminApproveOvertimeRequest(
    requestId: string,
    adminEmployeeId: string,
    approved: boolean,
  ): Promise<OvertimeRequest> {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new Error('Overtime request not found');
    }

    const updatedRequest = await this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: approved ? 'approved' : 'denied',
        approverId: adminEmployeeId,
      },
    });

    // Notify employee about the decision
    if (request.user.lineUserId) {
      await this.notificationService.sendOvertimeResponseNotification(
        request.user.employeeId,
        request.user.lineUserId,
        updatedRequest,
      );
    }

    return updatedRequest;
  }

  async getPendingOvertimeRequests(
    employeeId: string,
    date: Date,
  ): Promise<OvertimeRequest | null> {
    return this.prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        status: 'pending',
      },
    });
  }

  async getDayOffOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<OvertimeRequest | null> {
    return this.prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        isDayOffOvertime: true,
      },
    });
  }

  async getApprovedDayOffOvertime(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertimeInfo | null> {
    const overtimeRequest = await this.prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        isDayOffOvertime: true,
        status: 'approved',
        employeeResponse: 'approve',
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        isInsideShiftHours: true,
        isDayOffOvertime: true,
        durationMinutes: true,
        status: true,
        employeeResponse: true,
        reason: true,
      },
    });

    if (!overtimeRequest) return null;

    const currentTimeStr = format(date, 'HH:mm');
    // Include overtime if it's current or upcoming
    if (
      overtimeRequest.startTime > currentTimeStr ||
      (overtimeRequest.startTime <= currentTimeStr &&
        overtimeRequest.endTime > currentTimeStr)
    ) {
      return {
        ...overtimeRequest,
        employeeId,
        date,
        status: 'approved' as const,
        employeeResponse: 'approve' as const,
        approverId: '',
      };
    }

    return null;
  }

  async getDetailedOvertimesInRange(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ExtendedApprovedOvertime[]> {
    const overtimes = await this.prisma.overtimeRequest.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: 'approved',
      },
      include: {
        overtimeEntries: {
          orderBy: {
            actualStartTime: 'desc',
          },
        },
      },
    });

    const mapToOvertimeEntryData = (entries: any[]): OvertimeEntryData[] => {
      return entries.map((entry) => ({
        id: entry.id,
        attendanceId: entry.attendanceId,
        overtimeRequestId: entry.overtimeRequestId,
        actualStartTime: entry.actualStartTime,
        actualEndTime: entry.actualEndTime,
        isDayOffOvertime: entry.isDayOffOvertime ?? false,
        isInsideShiftHours: entry.isInsideShiftHours ?? false,
        createdAt: entry.createdAt || new Date(),
        updatedAt: entry.updatedAt || new Date(),
      }));
    };

    return overtimes.map(
      (overtime): ExtendedApprovedOvertime => ({
        id: overtime.id,
        employeeId: overtime.employeeId,
        date: overtime.date,
        startTime: overtime.startTime,
        endTime: overtime.endTime,
        durationMinutes: overtime.durationMinutes,
        status: overtime.status as OvertimeRequestStatus,
        employeeResponse: overtime.employeeResponse,
        reason: overtime.reason,
        approverId: overtime.approverId,
        isDayOffOvertime: overtime.isDayOffOvertime,
        isInsideShiftHours: overtime.isInsideShiftHours,
        overtimeEntries: mapToOvertimeEntryData(overtime.overtimeEntries),
      }),
    );
  }

  async batchApproveOvertimeRequests(
    requestIds: string[],
    approverId: string,
  ): Promise<OvertimeRequest[]> {
    const approvedRequests = await this.prisma.$transaction(
      requestIds.map((id) =>
        this.prisma.overtimeRequest.update({
          where: { id },
          data: { status: 'approved', approverId },
          include: {
            user: {
              select: {
                id: true,
                employeeId: true,
                lineUserId: true,
                name: true,
              },
            },
          },
        }),
      ),
    );

    for (const request of approvedRequests) {
      if (request.user.lineUserId) {
        await this.notificationService.sendOvertimeApprovalNotification(
          request.employeeId,
          request.user.lineUserId,
          request,
          approverId,
        );
      } else {
        console.warn(
          `No LINE User ID found for employee ${request.employeeId}`,
        );
      }
    }

    return approvedRequests;
  }

  private async notifyAdmins(
    message: string,
    type: 'overtime' | 'overtime-batch-approval',
  ): Promise<void> {
    console.log('notifyAdmins called with:', { message, type });

    const admins = await this.prisma.user.findMany({
      where: {
        role: {
          in: ['Admin', 'SuperAdmin'],
        },
      },
    });

    console.log(`Found ${admins.length} admins to notify`);

    for (const admin of admins) {
      if (admin.lineUserId) {
        const adminMessage = {
          type: 'text',
          text: message,
        };
        console.log(`Sending notification to admin ${admin.employeeId}`);
        try {
          await this.notificationService.sendNotification(
            admin.employeeId,
            admin.lineUserId,
            JSON.stringify(adminMessage),
            type,
          );
          console.log(
            `Notification sent successfully to admin ${admin.employeeId}`,
          );
        } catch (error) {
          console.error(
            `Error sending notification to admin ${admin.employeeId}:`,
            error,
          );
        }
      } else {
        console.log(`Admin ${admin.employeeId} has no LINE user ID`);
      }
    }
  }

  async rejectOvertimeRequest(
    requestId: string,
    rejectedBy: string,
  ): Promise<OvertimeRequest> {
    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
      include: {
        user: {
          select: {
            id: true,
            employeeId: true,
            lineUserId: true,
            name: true,
          },
        },
      },
    });

    if (!request) {
      throw new Error('Overtime request not found');
    }

    const rejectedRequest = await this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        approverId: rejectedBy,
      },
      include: {
        user: {
          select: {
            id: true,
            employeeId: true,
            lineUserId: true,
            name: true,
          },
        },
      },
    });

    // Send notification to employee
    if (request.user.lineUserId) {
      await this.notificationService.sendOvertimeResponseNotification(
        request.user.employeeId,
        request.user.lineUserId,
        rejectedRequest,
      );
    }

    return rejectedRequest;
  }

  async calculateOvertimeHours(
    startTime: string,
    endTime: string,
  ): Promise<number> {
    const start = parseISO(startTime);
    const end = parseISO(endTime);
    const totalMinutes = differenceInMinutes(end, start);
    const roundedMinutes = Math.floor(totalMinutes / 30) * 30;
    return roundedMinutes / 60;
  }

  async getOvertimeAttendances(
    employeeId: string,
    date: Date,
  ): Promise<OvertimeAttendanceInfo[]> {
    if (process.env.NODE_ENV === 'test') return [];

    const overtime = await this.getCurrentApprovedOvertimeRequest(
      employeeId,
      date,
    );
    if (!overtime) return [];

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
      },
      orderBy: { date: 'desc' },
    });

    const now = getCurrentTime();

    return [
      {
        overtimeRequest: overtime,
        attendanceTime: {
          checkInTime: attendance?.CheckInTime
            ? format(attendance.CheckInTime, 'HH:mm:ss')
            : null,
          checkOutTime: attendance?.CheckOutTime
            ? format(attendance.CheckOutTime, 'HH:mm:ss')
            : null,
          checkStatus: CheckStatus.PENDING,
          isOvertime: true,
          overtimeState: OvertimeState.NOT_STARTED,
        },
        periodStatus: {
          isPending: isAfter(
            parseISO(`${format(date, 'yyyy-MM-dd')}T${overtime.startTime}`),
            now,
          ),
          isActive: this.isInOvertimeWindow(now, overtime),
          isNext: this.isInOvertimeWindow(
            addMinutes(now, ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD),
            overtime,
          ),
          isComplete: attendance?.CheckOutTime != null,
        },
      },
    ];
  }
}

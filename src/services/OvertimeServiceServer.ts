// services/OvertimeServiceServer.ts
// services/OvertimeServiceServer.ts
import { PrismaClient, OvertimeRequest, Prisma, User } from '@prisma/client';
import { IOvertimeServiceServer } from '@/types/OvertimeService';
import { TimeEntryService } from './TimeEntryService';
import { ApprovedOvertime } from '@/types/attendance';
import {
  parseISO,
  format,
  startOfDay,
  endOfDay,
  differenceInMinutes,
  addDays,
  parse,
} from 'date-fns';
import { NotificationService } from './NotificationService';
import { th } from 'date-fns/locale';
import { HolidayService } from './HolidayService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { ShiftManagementService } from './ShiftManagementService';

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
      reason,
      status: 'pending_response',
      employeeResponse: null,
      isDayOffOvertime: isDayOff,
    };

    const newOvertimeRequest = await this.prisma.overtimeRequest.create({
      data: overtimeRequestData,
      include: { user: true },
    });

    await this.timeEntryService.createPendingOvertimeEntry(newOvertimeRequest);

    // Notify the employee about the new overtime request
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
    // Get employee's shift
    const shift = await this.shiftService.getEffectiveShiftAndStatus(
      employeeId,
      date,
    );
    if (!shift) return true; // If no shift is assigned, consider it a day off
    // Check if it's a holiday
    const isHoliday = await this.holidayService.isHoliday(
      date,
      [], // Pass an empty array for holidays if not needed
      shift.shiftCode === 'SHIFT104', // Adjust this condition based on your business logic
    );
    if (isHoliday) return true;

    // Check if the day is a working day for this shift
    const dayOfWeek = date.getDay();
    if (!shift.workDays.includes(dayOfWeek)) return true;

    // Check if the employee has an approved leave for this day
    const leave = await this.leaveService.checkUserOnLeave(employeeId, date);
    if (leave) return true;

    // If none of the above conditions are met, it's a working day
    return false;
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

    await this.timeEntryService.createPendingOvertimeEntry(approvedRequest);

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

  async updateOvertimeActualStartTime(
    requestId: string,
    actualStartTime: Date,
  ): Promise<OvertimeRequest> {
    return this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: { actualStartTime },
    });
  }

  async updateOvertimeActualEndTime(
    requestId: string,
    actualEndTime: Date,
  ): Promise<OvertimeRequest> {
    const overtimeRequest = await this.prisma.overtimeRequest.findUnique({
      where: { id: requestId },
    });

    if (!overtimeRequest) {
      throw new Error('Overtime request not found');
    }

    // If there's no actual start time, use the start time
    const actualStartTime =
      overtimeRequest.actualStartTime ||
      parseISO(
        `${format(overtimeRequest.date, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
      );

    return this.prisma.overtimeRequest.update({
      where: { id: requestId },
      data: {
        actualEndTime,
        actualStartTime: actualStartTime,
      },
    });
  }

  async getApprovedOvertimeRequest(
    employeeId: string,
    date: Date,
  ): Promise<ApprovedOvertime | null> {
    const overtimeRequest = await this.prisma.overtimeRequest.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
        status: 'approved',
      },
    });

    if (!overtimeRequest) return null;

    return this.convertToApprovedOvertime(overtimeRequest);
  }

  async getFutureApprovedOvertimes(
    employeeId: string,
    startDate: Date,
  ): Promise<ApprovedOvertime[]> {
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
  ): ApprovedOvertime {
    // Helper function to map OvertimeRequest status to ApprovedOvertime status
    const mapStatus = (status: string): ApprovedOvertime['status'] => {
      switch (status) {
        case 'approved':
          return 'approved';
        case 'pending':
          return 'in_progress';
        case 'completed':
          return 'completed';
        default:
          return 'not_started';
      }
    };

    return {
      id: overtime.id,
      employeeId: overtime.employeeId,
      date: overtime.date,
      startTime: overtime.startTime,
      endTime: overtime.endTime,
      status: mapStatus(overtime.status),
      reason: overtime.reason || null,
      isDayOffOvertime: overtime.isDayOffOvertime || false,
      actualStartTime: overtime.actualStartTime,
      actualEndTime: overtime.actualEndTime,
      approvedBy: overtime.approverId || '',
      approvedAt: overtime.updatedAt || new Date(),
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

    if (approved) {
      const approvedOvertime = this.convertToApprovedOvertime(updatedRequest);
      await this.timeEntryService.finalizePendingOvertimeEntry(
        approvedOvertime,
      );
    } else {
      await this.timeEntryService.deletePendingOvertimeEntry(updatedRequest.id);
    }

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

  async getApprovedOvertimesInRange(
    employeeId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<ApprovedOvertime[]> {
    const overtimes = await this.prisma.overtimeRequest.findMany({
      where: {
        employeeId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: 'approved', // Only fetch approved overtimes
      },
    });

    return overtimes.map(
      (overtime): ApprovedOvertime => ({
        id: overtime.id,
        employeeId: overtime.employeeId,
        date: overtime.date,
        startTime: overtime.startTime,
        endTime: overtime.endTime,
        status: 'approved', // All fetched overtimes are approved
        reason: overtime.reason || null,
        isDayOffOvertime: overtime.isDayOffOvertime || false,
        actualStartTime: overtime.actualStartTime,
        actualEndTime: overtime.actualEndTime,
        approvedBy: overtime.approverId || '',
        approvedAt: overtime.updatedAt || new Date(),
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
      await this.timeEntryService.createPendingOvertimeEntry(request);

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
    type: 'overtime' | 'overtime-digest' | 'overtime-batch-approval',
  ) {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPERADMIN'] } },
    });

    for (const admin of admins) {
      if (admin.lineUserId) {
        await this.notificationService.sendNotification(
          admin.employeeId,
          admin.lineUserId,
          JSON.stringify({
            type: 'text',
            text: message,
          }),
          type,
        );
      }
    }
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
}

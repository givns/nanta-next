// services/Attendance/AttendanceService.ts
import { PrismaClient } from '@prisma/client';
import { AttendanceCheckService } from './AttendanceCheckService';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { AttendanceStatusService } from './AttendanceStatusService';
import {
  ProcessingOptions,
  ProcessingResult,
  CheckInOutAllowance,
  AttendanceStatusInfo,
  PeriodType,
  AttendanceBaseResponse,
  CheckStatus,
  ValidationResponse,
  AttendanceState,
  OvertimeState,
} from '../../types/attendance';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { HolidayService } from '../HolidayService';
import { NotificationService } from '../NotificationService';
import { TimeEntryService } from '../TimeEntryService';
import { getCacheData, setCacheData } from '@/lib/serverCache';
import { getCurrentTime } from '@/utils/dateUtils';
import { startOfDay, endOfDay } from 'date-fns';
import { now } from 'lodash';

export class AttendanceService {
  private readonly checkService: AttendanceCheckService;
  private readonly processingService: AttendanceProcessingService;
  private readonly statusService: AttendanceStatusService;
  private readonly prisma: PrismaClient;
  private readonly shiftService: ShiftManagementService;

  constructor(
    prisma: PrismaClient,
    shiftService: ShiftManagementService,
    holidayService: HolidayService,
    leaveService: LeaveServiceServer,
    overtimeService: OvertimeServiceServer,
    notificationService: NotificationService,
    timeEntryService: TimeEntryService,
  ) {
    this.prisma = prisma;
    this.shiftService = shiftService;
    // Initialize specialized services
    this.processingService = new AttendanceProcessingService(
      prisma,
      shiftService,
      overtimeService,
      timeEntryService,
      leaveService,
      holidayService,
    );
    this.checkService = new AttendanceCheckService(
      prisma,
      shiftService,
      overtimeService,
      leaveService,
      holidayService,
      this.processingService,
    );

    this.statusService = new AttendanceStatusService(
      prisma,
      shiftService,
      holidayService,
      leaveService,
      overtimeService,
      notificationService,
    );
  }

  async getBaseStatus(employeeId: string): Promise<AttendanceBaseResponse> {
    const cacheKey = `attendance:status:${employeeId}`;
    const cached = await getCacheData(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = getCurrentTime();
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(now),
          lt: endOfDay(now),
        },
      },
      include: {
        overtimeEntries: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const result: AttendanceBaseResponse = {
      state: (attendance?.state as AttendanceState) || AttendanceState.ABSENT,
      checkStatus:
        (attendance?.checkStatus as CheckStatus) || CheckStatus.PENDING,
      isCheckingIn: !attendance?.CheckInTime,
      latestAttendance: attendance
        ? {
            date: attendance.date.toISOString(),
            CheckInTime: attendance.CheckInTime?.toISOString() || null,
            CheckOutTime: attendance.CheckOutTime?.toISOString() || null,
            state:
              (attendance.state as AttendanceState) || AttendanceState.ABSENT,
            checkStatus:
              (attendance.checkStatus as CheckStatus) || CheckStatus.PENDING,
            overtimeState: attendance.overtimeState as
              | OvertimeState
              | undefined,
            isLateCheckIn: attendance.isLateCheckIn ?? false,
            isOvertime: attendance.isOvertime ?? false,
            isManualEntry: attendance.isManualEntry ?? false,
            isDayOff: attendance.isDayOff ?? false,
            shiftStartTime:
              attendance.shiftStartTime?.toISOString() || undefined, // Convert to string
            shiftEndTime: attendance.shiftEndTime?.toISOString() || undefined,
          }
        : undefined,
    };

    console.log('getBaseStatus result before cache:', result);

    await setCacheData(cacheKey, JSON.stringify(result), 300);
    return result;
  }

  async validateCheckInOut(
    employeeId: string,
    inPremises: boolean,
    address: string,
  ): Promise<ValidationResponse> {
    const now = getCurrentTime();

    const window = await this.shiftService.getCurrentWindow(employeeId, now);
    if (!window) {
      return {
        allowed: false,
        reason: 'No active window found',
        flags: {
          isLateCheckIn: false,
          isEarlyCheckOut: false,
          isPlannedHalfDayLeave: false,
          isEmergencyLeave: false,
          isOvertime: false,
          requireConfirmation: false,
          isDayOffOvertime: false,
          isInsideShift: false,
        },
      };
    }

    // Delegate to checkService for detailed validation
    const allowance = await this.checkService.isCheckInOutAllowed(
      employeeId,
      inPremises,
      address,
    );

    return {
      allowed: allowance.allowed,
      reason: allowance.reason,
      flags: {
        isLateCheckIn: Boolean(allowance.flags.isLateCheckIn),
        isEarlyCheckOut: Boolean(allowance.flags.isEarlyCheckOut),
        isPlannedHalfDayLeave: Boolean(allowance.flags.isPlannedHalfDayLeave),
        isEmergencyLeave: Boolean(allowance.flags.isEmergencyLeave),
        isOvertime: Boolean(allowance.flags.isOvertime),
        requireConfirmation: false,
        isDayOffOvertime: false,
        isInsideShift: false,
      },
    };
  }

  async createInitialAttendanceStatus(
    userId: string,
    preparedUser: any,
  ): Promise<AttendanceStatusInfo> {
    return this.statusService.createInitialAttendanceStatus(
      userId,
      preparedUser,
    );
  }

  async isCheckInOutAllowed(
    employeeId: string,
    inPremises: boolean,
    address: string,
  ): Promise<CheckInOutAllowance> {
    return this.checkService.isCheckInOutAllowed(
      employeeId,
      inPremises,
      address,
    );
  }

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    return this.processingService.processAttendance(options);
  }

  async getLatestAttendanceStatus(
    employeeId: string,
  ): Promise<AttendanceStatusInfo> {
    return this.statusService.getLatestAttendanceStatus(employeeId);
  }

  async checkMissingAttendance(): Promise<void> {
    return this.statusService.checkMissingAttendance();
  }
}

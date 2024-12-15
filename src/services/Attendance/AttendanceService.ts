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
  AttendanceBaseResponse,
  CheckStatus,
  ValidationResponse,
  AttendanceState,
  OvertimeState,
  Period,
  PeriodType,
} from '../../types/attendance';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { HolidayService } from '../HolidayService';
import { NotificationService } from '../NotificationService';
import { TimeEntryService } from '../TimeEntryService';
import { getCacheData, setCacheData } from '@/lib/serverCache';
import { getCurrentTime } from '@/utils/dateUtils';
import { startOfDay, endOfDay, addDays, format, parseISO } from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';
import { AutoCompletionService } from './AutoCompletionService';

export class AttendanceService {
  private readonly checkService: AttendanceCheckService;
  private readonly processingService: AttendanceProcessingService;
  private readonly statusService: AttendanceStatusService;
  private readonly prisma: PrismaClient;
  private readonly shiftService: ShiftManagementService;
  private readonly overTimeService: OvertimeServiceServer;
  private readonly periodManager: PeriodManagementService;
  private readonly autoCompleter: AutoCompletionService;

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
    this.overTimeService = overtimeService;
    this.periodManager = new PeriodManagementService();
    this.autoCompleter = new AutoCompletionService();
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

    let state = AttendanceState.ABSENT;
    let checkStatus = CheckStatus.PENDING;
    let isCheckingIn = true;

    if (attendance) {
      if (attendance.CheckInTime) {
        state = attendance.CheckOutTime
          ? AttendanceState.PRESENT
          : AttendanceState.PRESENT;

        // Determine checking in state based on last check-out
        isCheckingIn =
          !attendance.CheckOutTime ||
          (attendance.CheckOutTime && attendance.isOvertime);
      }

      if (attendance.CheckInTime && !attendance.CheckOutTime) {
        checkStatus = CheckStatus.CHECKED_IN;
      } else if (attendance.CheckOutTime) {
        checkStatus = CheckStatus.CHECKED_OUT;

        // If last check-out was from overtime, prepare for regular shift check-in
        if (attendance.isOvertime) {
          isCheckingIn = true;
        }
      }

      if (attendance.isOvertime) {
        state = AttendanceState.OVERTIME;
      }
    }

    const result: AttendanceBaseResponse = {
      state,
      checkStatus,
      isCheckingIn: !attendance?.CheckInTime || !!attendance?.CheckOutTime,
      latestAttendance: attendance
        ? {
            id: attendance.id,
            employeeId: attendance.employeeId,
            date: attendance.date.toISOString(),
            CheckInTime: attendance.CheckInTime?.toISOString() || null,
            CheckOutTime: attendance.CheckOutTime?.toISOString() || null,
            state,
            checkStatus,
            overtimeState: attendance.overtimeState as
              | OvertimeState
              | undefined,
            isLateCheckIn: attendance.isLateCheckIn ?? false,
            isLateCheckOut: attendance.isLateCheckOut ?? false,
            isEarlyCheckIn: attendance.isEarlyCheckIn ?? false,
            isOvertime: attendance.isOvertime ?? false,
            isManualEntry: attendance.isManualEntry ?? false,
            isDayOff: attendance.isDayOff ?? false,
            shiftStartTime:
              attendance.shiftStartTime?.toISOString() || undefined,
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
          isAutoCheckIn: false,
          isAutoCheckOut: false,
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
        isAutoCheckIn: false,
        isAutoCheckOut: false,
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
    const currentPeriods = await this.getCurrentPeriods(employeeId);
    const currentPeriod = this.periodManager.determineCurrentPeriod(
      getCurrentTime(),
      currentPeriods,
    );
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

  private async getCurrentPeriods(employeeId: string): Promise<Period[]> {
    const now = getCurrentTime();
    const periods: Period[] = [];

    // Get overtime period first
    const overtimeRequest =
      await this.overTimeService.getCurrentApprovedOvertimeRequest(
        employeeId,
        now,
      );

    if (overtimeRequest) {
      periods.push({
        type: PeriodType.OVERTIME,
        startTime: parseISO(
          `${format(now, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
        ),
        endTime: parseISO(
          `${format(now, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
        ),
        isOvertime: true,
        overtimeId: overtimeRequest.id,
        isOvernight: overtimeRequest.endTime < overtimeRequest.startTime,
      });
    }

    // Add regular shift period
    const shift = await this.shiftService.getEffectiveShiftAndStatus(
      employeeId,
      now,
    );
    if (shift?.effectiveShift) {
      periods.push({
        type: PeriodType.REGULAR,
        startTime: parseISO(
          `${format(now, 'yyyy-MM-dd')}T${shift.effectiveShift.startTime}`,
        ),
        endTime: parseISO(
          `${format(now, 'yyyy-MM-dd')}T${shift.effectiveShift.endTime}`,
        ),
        isOvertime: false,
        isOvernight:
          shift.effectiveShift.endTime < shift.effectiveShift.startTime,
      });
    }

    return periods;
  }
}

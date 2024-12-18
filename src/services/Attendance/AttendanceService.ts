// services/Attendance/AttendanceService.ts
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PrismaClient,
} from '@prisma/client';
import { AttendanceCheckService } from './AttendanceCheckService';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { AttendanceStatusService } from './AttendanceStatusService';
import {
  ProcessingOptions,
  ProcessingResult,
  CheckInOutAllowance,
  AttendanceStatusInfo,
  AttendanceBaseResponse,
  ValidationResponse,
  Period,
  PeriodType,
  AttendanceFlags,
  AttendanceRecord,
  LatestAttendanceResponse,
  PeriodStatus,
} from '../../types/attendance';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { HolidayService } from '../HolidayService';
import { NotificationService } from '../NotificationService';
import { TimeEntryService } from '../TimeEntryService';
import { getCacheData, setCacheData } from '@/lib/serverCache';
import { getCurrentTime } from '@/utils/dateUtils';
import { startOfDay, endOfDay, format, parseISO } from 'date-fns';
import { PeriodManagementService } from './PeriodManagementService';
import { AutoCompletionService } from './AutoCompletionService';
import { AttendanceMappers } from './utils/AttendanceMappers';

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
    this.mappers = new AttendanceMappers(); // Add mapper instance

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
  private readonly mappers: AttendanceMappers;

  async getBaseStatus(employeeId: string): Promise<AttendanceBaseResponse> {
    const cacheKey = `attendance:status:${employeeId}`;
    const cached = await getCacheData(cacheKey);
    if (cached) return JSON.parse(cached);

    const now = getCurrentTime();
    const rawAttendance = await this.getCurrentPeriodAttendance(
      employeeId,
      now,
    );

    try {
      // Map raw attendance to AttendanceRecord with proper type
      const attendance = rawAttendance
        ? AttendanceMappers.toAttendanceRecord({
            ...rawAttendance,
            type: rawAttendance.isOvertime
              ? PeriodType.OVERTIME
              : PeriodType.REGULAR,
            overtimeState: this.mapOvertimeState(rawAttendance.overtimeState),
            // Ensure overtimeEntries is always an array
            overtimeEntries: rawAttendance.overtimeEntries || [],
            timeEntries: rawAttendance.timeEntries || [],
          })
        : null;

      if (!attendance) {
        return this.createInitialBaseStatus();
      }

      const baseStatus: AttendanceBaseResponse = {
        state: this.determineState(attendance),
        checkStatus: this.determineCheckStatus(attendance),
        isCheckingIn: !attendance.CheckInTime || !!attendance.CheckOutTime,
        latestAttendance: this.mapToLatestAttendance(attendance),
        periodInfo: {
          currentType: attendance.type,
          isOvertime: attendance.isOvertime || false,
          overtimeState: attendance.overtimeState,
          isTransitioning: false,
        },
        flags: this.createBaseFlags({
          ...attendance,
          overtimeEntries: attendance.overtimeEntries || [], // Ensure it's never undefined
        }),
        metadata: {
          lastUpdated: now.toISOString(),
          version: 1,
          source: attendance.isManualEntry ? 'manual' : 'system',
        },
      };

      await setCacheData(cacheKey, JSON.stringify(baseStatus), 300);
      return baseStatus;
    } catch (error) {
      console.error('Error in getBaseStatus:', error);
      // If something goes wrong, return initial state rather than throwing
      return this.createInitialBaseStatus();
    }
  }

  public mapOvertimeState(state: string | null): OvertimeState | undefined {
    if (!state) return undefined;

    switch (state) {
      case 'overtime-started':
        return OvertimeState.IN_PROGRESS;
      case 'overtime-ended':
        return OvertimeState.COMPLETED;
      case 'not-started':
        return OvertimeState.NOT_STARTED;
      default:
        return undefined;
    }
  }

  private async getCurrentPeriodAttendance(employeeId: string, date: Date) {
    return this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(date),
          lt: endOfDay(date),
        },
      },
      include: {
        timeEntries: true,
        overtimeEntries: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private mapToLatestAttendance(
    record: AttendanceRecord,
  ): LatestAttendanceResponse {
    return {
      id: record.id,
      employeeId: record.employeeId,
      date: record.date.toISOString(),
      CheckInTime: record.CheckInTime?.toISOString() || null,
      CheckOutTime: record.CheckOutTime?.toISOString() || null,
      state: record.state,
      checkStatus: record.checkStatus,
      overtimeState: record.overtimeState,
      isLateCheckIn: record.isLateCheckIn,
      isLateCheckOut: record.isLateCheckOut,
      isEarlyCheckIn: record.isEarlyCheckIn,
      isOvertime: record.isOvertime,
      isManualEntry: record.isManualEntry,
      isDayOff: record.isDayOff,
      shiftStartTime: record.shiftStartTime?.toISOString(),
      shiftEndTime: record.shiftEndTime?.toISOString(),
      periodType: record.type,
      overtimeId: record.overtimeId,
      timeEntries: record.timeEntries.map((entry) => ({
        id: entry.id,
        startTime: entry.startTime.toISOString(),
        endTime: entry.endTime?.toISOString() || null,
        type: entry.entryType,
      })),
    };
  }

  async getAttendanceForPeriod(
    employeeId: string,
    period: Period,
  ): Promise<AttendanceRecord | null> {
    const record = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(period.startTime),
          lt: endOfDay(period.endTime),
        },
        isOvertime: period.isOvertime,
        OR: [{ overtimeId: period.overtimeId }, { overtimeId: null }],
      },
      include: {
        timeEntries: true,
        overtimeEntries: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return record ? AttendanceMappers.toAttendanceRecord(record) : null;
  }

  private determineState(attendance: AttendanceRecord): AttendanceState {
    if (!attendance.CheckInTime) return AttendanceState.ABSENT;
    if (!attendance.CheckOutTime) return AttendanceState.INCOMPLETE;
    if (attendance.isOvertime) return AttendanceState.OVERTIME;
    return AttendanceState.PRESENT;
  }

  private determineCheckStatus(attendance: AttendanceRecord): CheckStatus {
    if (!attendance.CheckInTime) return CheckStatus.PENDING;
    if (!attendance.CheckOutTime) return CheckStatus.CHECKED_IN;
    return CheckStatus.CHECKED_OUT;
  }

  private createBaseFlags(attendance: AttendanceRecord): AttendanceFlags {
    const overtimeEntries = attendance.overtimeEntries || [];

    return {
      isOvertime: attendance.isOvertime || false,
      isDayOffOvertime: Boolean(
        overtimeEntries.some((e) => e.isDayOffOvertime),
      ),
      isPendingDayOffOvertime: false,
      isPendingOvertime: false,
      isOutsideShift: false,
      isInsideShift: true,
      isLate: attendance.isLateCheckIn || false,
      isEarlyCheckIn: attendance.isEarlyCheckIn || false,
      isEarlyCheckOut: false,
      isLateCheckIn: attendance.isLateCheckIn || false,
      isLateCheckOut: attendance.isLateCheckOut || false,
      isVeryLateCheckOut: attendance.isVeryLateCheckOut || false,
      isAutoCheckIn: false,
      isAutoCheckOut: false,
      isAfternoonShift: false,
      isMorningShift: false,
      isAfterMidshift: false,
      isApprovedEarlyCheckout: false,
      isPlannedHalfDayLeave: false,
      isEmergencyLeave: false,
      hasActivePeriod: Boolean(
        attendance.CheckInTime && !attendance.CheckOutTime,
      ),
      hasPendingTransition: false,
      requiresAutoCompletion: false,
      isHoliday: false,
      isDayOff: attendance.isDayOff || false,
      isManualEntry: attendance.isManualEntry || false,
    };
  }

  private createInitialBaseStatus(): AttendanceBaseResponse {
    return {
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      isCheckingIn: true,
      periodInfo: {
        currentType: PeriodType.REGULAR,
        isOvertime: false,
        isTransitioning: false,
      },
      flags: this.createBaseFlags({} as AttendanceRecord),
      metadata: {
        lastUpdated: new Date().toISOString(),
        version: 1,
        source: 'system',
      },
    };
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
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtimeRequest.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${overtimeRequest.endTime}`,
      );

      periods.push({
        type: PeriodType.OVERTIME,
        startTime: overtimeStart,
        endTime: overtimeEnd,
        isOvertime: true,
        overtimeId: overtimeRequest.id,
        isOvernight: overtimeRequest.endTime < overtimeRequest.startTime,
        isDayOffOvertime: overtimeRequest.isDayOffOvertime,
        isConnected: false,
        status: this.determineInitialPeriodStatus(
          now,
          overtimeStart,
          overtimeEnd,
        ),
      });
    }

    // Add regular shift period
    const shift = await this.shiftService.getEffectiveShiftAndStatus(
      employeeId,
      now,
    );

    if (shift?.effectiveShift) {
      const regularStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${shift.effectiveShift.startTime}`,
      );
      const regularEnd = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${shift.effectiveShift.endTime}`,
      );

      periods.push({
        type: PeriodType.REGULAR,
        startTime: regularStart,
        endTime: regularEnd,
        isOvertime: false,
        isOvernight:
          shift.effectiveShift.endTime < shift.effectiveShift.startTime,
        isDayOffOvertime: false,
        isConnected: false,
        status: this.determineInitialPeriodStatus(
          now,
          regularStart,
          regularEnd,
        ),
      });
    }

    return periods;
  }
  private determineInitialPeriodStatus(
    currentTime: Date,
    startTime: Date,
    endTime: Date,
  ): PeriodStatus {
    if (currentTime < startTime) {
      return PeriodStatus.PENDING;
    }
    if (currentTime > endTime) {
      return PeriodStatus.COMPLETED;
    }
    return PeriodStatus.ACTIVE;
  }
}

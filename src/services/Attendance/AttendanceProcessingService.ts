// services/Attendance/AttendanceProcessingService.ts

import { PrismaClient, Prisma } from '@prisma/client';
import {
  AttendanceState,
  CheckStatus,
  AttendanceCompositeStatus,
  StatusUpdateResult,
  TimeEntryStatus,
  PeriodType,
  PeriodStatus,
} from '@/types/attendance/status';
import {
  ProcessingOptions,
  ProcessingResult,
} from '@/types/attendance/processing';
import { AppError, ErrorCode } from '@/types/attendance/error';
import { AttendanceRecord } from '@/types/attendance/records';
import { getCurrentTime } from '@/utils/dateUtils';
import {
  startOfDay,
  endOfDay,
  parseISO,
  format,
  isAfter,
  isWithinInterval,
} from 'date-fns';

// Import services
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { OvertimeServiceServer } from '../OvertimeServiceServer';
import { TimeEntryService } from '../TimeEntryService';
import { LeaveServiceServer } from '../LeaveServiceServer';
import { HolidayService } from '../HolidayService';

// Import utils
import { AttendanceMappers } from './utils/AttendanceMappers';
import { AttendanceValidators } from './utils/AttendanceValidators';
import { AttendanceResponseBuilder } from './utils/AttendanceResponseBuilder';
import { StatusHelpers } from './utils/StatusHelper';
import { AttendancePeriodContext } from '@/types/attendance/common';
import { LeaveRequest } from '@/types/attendance/leave';

export class AttendanceProcessingService {
  constructor(
    private prisma: PrismaClient,
    private shiftService: ShiftManagementService,
    private overtimeService: OvertimeServiceServer,
    private timeEntryService: TimeEntryService,
    private leaveService: LeaveServiceServer,
    private holidayService: HolidayService,
  ) {}

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    return this.prisma.$transaction(async (tx) => {
      try {
        // 1. Validate input
        const validationResult =
          await AttendanceValidators.validateProcessingOptions(options);
        if (!validationResult.isValid) {
          throw new AppError({
            code: ErrorCode.INVALID_INPUT,
            message: validationResult.errors[0].message,
          });
        }

        // 2. Get current attendance and context
        const [currentAttendance, periodContext] = await Promise.all([
          this.getLatestAttendance(options.employeeId),
          this.getPeriodContext(
            tx,
            options.employeeId,
            new Date(options.checkTime),
          ),
        ]);

        // 3. Process status transition
        const statusUpdate = await StatusHelpers.processStatusTransition(
          currentAttendance
            ? AttendanceMappers.toCompositeStatus(currentAttendance)
            : this.getInitialStatus(),
          options,
        );

        // Process attendance change
        const processedAttendance = await this.processAttendanceChange(
          tx,
          currentAttendance,
          statusUpdate,
          options,
          periodContext,
        );

        // Process time entries with proper type conversion
        const timeEntries = await this.timeEntryService.processTimeEntries(
          tx,
          processedAttendance,
          statusUpdate,
          options,
        );

        // Convert entry types to proper enums
        const mappedTimeEntries = {
          regular: timeEntries.regular
            ? {
                ...timeEntries.regular,
                status: timeEntries.regular.status as TimeEntryStatus,
                entryType: PeriodType.REGULAR,
              }
            : undefined,
          overtime: timeEntries.overtime?.map((entry) => ({
            ...entry,
            status: entry.status as TimeEntryStatus,
            entryType: PeriodType.OVERTIME,
          })),
        };

        // Log status change
        await this.logStatusChange(tx, statusUpdate, options);

        return AttendanceResponseBuilder.createProcessingResponse(
          processedAttendance,
          mappedTimeEntries,
          statusUpdate.stateChange.overtime?.current
            ? {
                isOvertime: true,
                metadata: statusUpdate.metadata,
              }
            : undefined,
        );
      } catch (error) {
        throw this.handleProcessingError(error);
      }
    });
  }
  public async getLatestAttendance(
    employeeId: string,
  ): Promise<AttendanceRecord | null> {
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: startOfDay(getCurrentTime()),
          lt: endOfDay(getCurrentTime()),
        },
      },
      orderBy: { date: 'desc' },
      include: {
        timeEntries: true,
        overtimeEntries: true,
      },
    });

    return attendance ? AttendanceMappers.toAttendanceRecord(attendance) : null;
  }

  private async getPeriodContext(
    tx: Prisma.TransactionClient,
    employeeId: string,
    checkTime: Date,
  ): Promise<AttendancePeriodContext> {
    const startDate = startOfDay(checkTime);
    const endDate = endOfDay(checkTime);

    const [shift, overtime, leave, holiday] = await Promise.all([
      this.shiftService.getEffectiveShiftAndStatus(employeeId, checkTime),
      this.overtimeService.getApprovedOvertimeRequest(employeeId, checkTime),
      this.leaveService.checkUserOnLeave(employeeId, checkTime),
      this.holidayService.getHolidays(startDate, endDate),
    ]);

    // Get user data for the context
    const user = await tx.user.findUnique({
      where: { employeeId },
      select: {
        employeeId: true,
        shiftCode: true,
      },
    });

    if (!user) {
      throw new AppError({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    // Get shift times
    const shiftTimes = shift?.effectiveShift
      ? {
          start: this.shiftService.utils.parseShiftTime(
            shift.effectiveShift.startTime,
            checkTime,
          ),
          end: this.shiftService.utils.parseShiftTime(
            shift.effectiveShift.endTime,
            checkTime,
          ),
        }
      : {
          start: startOfDay(checkTime),
          end: endOfDay(checkTime),
        };

    // Determine period type and status
    const entryType = overtime ? PeriodType.OVERTIME : PeriodType.REGULAR;

    // Determine period status
    let periodStatus = PeriodStatus.PENDING;
    if (overtime) {
      const overtimeStart = parseISO(
        `${format(checkTime, 'yyyy-MM-dd')}T${overtime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(checkTime, 'yyyy-MM-dd')}T${overtime.endTime}`,
      );

      if (
        isWithinInterval(checkTime, { start: overtimeStart, end: overtimeEnd })
      ) {
        periodStatus = PeriodStatus.ACTIVE;
      } else if (isAfter(checkTime, overtimeEnd)) {
        periodStatus = PeriodStatus.COMPLETED;
      }
    } else {
      if (
        isWithinInterval(checkTime, {
          start: shiftTimes.start,
          end: shiftTimes.end,
        })
      ) {
        periodStatus = PeriodStatus.ACTIVE;
      } else if (isAfter(checkTime, shiftTimes.end)) {
        periodStatus = PeriodStatus.COMPLETED;
      }
    }

    return {
      date: checkTime,
      isHoliday: holiday.length > 0,
      isDayOff: shift?.shiftstatus.isDayOff || false,
      entryType, // Added
      leaveRequest: this.mapToLeaveRequest(leave),
      approvedOvertime: overtime,
      effectiveShift: shift?.effectiveShift || null,
      shiftTimes,
      PeriodStatus: periodStatus, // Added
      user: {
        employeeId: user.employeeId,
        shiftCode: user.shiftCode || '',
      },
    };
  }

  // Helper function to map LeaveRequest
  private mapToLeaveRequest(leave: any): LeaveRequest | null {
    if (!leave) return null;
    return {
      ...leave,
      date: leave.startDate, // Add required date field
    };
  }

  private async processAttendanceChange(
    tx: Prisma.TransactionClient,
    currentAttendance: AttendanceRecord | null,
    statusUpdate: StatusUpdateResult,
    options: ProcessingOptions,
    context: AttendancePeriodContext,
  ): Promise<AttendanceRecord> {
    const { isCheckIn, checkTime, location } = options;
    const date = new Date(checkTime);
    const startDate = startOfDay(date);

    // Prepare location data as Prisma JSON
    const locationData = location
      ? ({
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
          provider: location.provider,
        } as Prisma.JsonObject)
      : null;

    // Create raw data without Prisma field operations
    const rawUpdateData = {
      state: statusUpdate.stateChange.state.current,
      checkStatus: statusUpdate.stateChange.checkStatus.current,
      isOvertime:
        statusUpdate.stateChange.overtime?.current?.isOvertime || false,
      overtimeState: statusUpdate.stateChange.overtime?.current?.state,
      ...(isCheckIn
        ? {
            regularCheckInTime: date,
            checkInLocation: locationData,
          }
        : {
            regularCheckOutTime: date,
            checkOutLocation: locationData,
          }),
      shiftStartTime: context.shiftTimes.start,
      shiftEndTime: context.shiftTimes.end,
      isDayOff: context.isDayOff,
      isManualEntry: options.isManualEntry || false,
    };

    // Create separate data objects for create and update
    const createData = {
      employeeId: options.employeeId as string, // Force string type
      date: startDate as Date, // Force Date type
      version: 1 as number, // Force number type
      ...rawUpdateData,
    };

    const updatedAttendance = await tx.attendance.upsert({
      where: {
        employee_date_attendance: {
          employeeId: options.employeeId,
          date: startDate,
        },
      },
      create: createData,
      update: rawUpdateData,
      include: {
        timeEntries: true,
        overtimeEntries: true,
      },
    });

    const mappedAttendance =
      AttendanceMappers.toAttendanceRecord(updatedAttendance);
    if (!mappedAttendance) {
      throw new AppError({
        code: ErrorCode.PROCESSING_ERROR,
        message: 'Failed to map attendance record',
      });
    }

    return mappedAttendance;
  }

  private async logStatusChange(
    tx: Prisma.TransactionClient,
    statusUpdate: StatusUpdateResult,
    options: ProcessingOptions,
  ): Promise<void> {
    // Instead of using attendanceStatusLog, use a regular attendance_logs table
    await tx.attendanceLogs.create({
      data: {
        employeeId: options.employeeId,
        previousState: statusUpdate.stateChange.state.previous,
        currentState: statusUpdate.stateChange.state.current,
        previousCheckStatus: statusUpdate.stateChange.checkStatus.previous,
        currentCheckStatus: statusUpdate.stateChange.checkStatus.current,
        previousOvertimeState:
          statusUpdate.stateChange.overtime?.previous?.state,
        currentOvertimeState: statusUpdate.stateChange.overtime?.current?.state,
        isOvertimeTransition: !!statusUpdate.stateChange.overtime,
        reason: statusUpdate.reason,
        metadata: statusUpdate.metadata as Prisma.JsonValue,
        timestamp: statusUpdate.timestamp,
        attendance: {
          connect: {
            employee_date_attendance: {
              employeeId: options.employeeId,
              date: startOfDay(new Date(options.checkTime)),
            },
          },
        },
        date: startOfDay(new Date(options.checkTime)),
      },
    });
  }

  private getInitialStatus(): AttendanceCompositeStatus {
    return {
      state: AttendanceState.ABSENT,
      checkStatus: CheckStatus.PENDING,
      isOvertime: false,
      overtimeState: undefined,
    };
  }

  private handleProcessingError(error: unknown): never {
    if (error instanceof AppError) {
      throw error;
    }

    console.error('Attendance processing error:', error);
    throw new AppError({
      code: ErrorCode.PROCESSING_ERROR,
      message: 'Failed to process attendance',
      originalError: error,
    });
  }
}

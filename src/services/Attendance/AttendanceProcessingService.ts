// services/Attendance/AttendanceProcessingService.ts

import {
  PrismaClient,
  Prisma,
  OvertimeState,
  AttendanceState,
  CheckStatus,
} from '@prisma/client';
import {
  AttendanceCompositeStatus,
  StatusUpdateResult,
  TimeEntryStatus,
  PeriodType,
  PeriodStatus,
  ProcessingOptions,
  ProcessingResult,
  AttendanceRecord,
  AppError,
  ErrorCode,
  LeaveRequest,
  AttendancePeriodContext,
  TimeEntry,
} from '../../types/attendance';
import { getCurrentTime } from '../../utils/dateUtils';
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

export class AttendanceProcessingService {
  constructor(
    private prisma: PrismaClient,
    private shiftService: ShiftManagementService,
    private overtimeService: OvertimeServiceServer,
    private timeEntryService: TimeEntryService,
    private leaveService: LeaveServiceServer,
    private holidayService: HolidayService,
  ) {}

  private mapTimeEntry(entry: any, isOvertime: boolean = false): TimeEntry {
    return {
      id: entry.id,
      employeeId: entry.employeeId,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      status: TimeEntryStatus.COMPLETED,
      entryType: isOvertime ? PeriodType.OVERTIME : PeriodType.REGULAR,
      regularHours: entry.regularHours || 0,
      overtimeHours: entry.overtimeHours || 0,
      attendanceId: entry.attendanceId || null,
      overtimeRequestId: entry.overtimeRequestId || null,
      actualMinutesLate: entry.actualMinutesLate || 0,
      isHalfDayLate: entry.isHalfDayLate || false,
      overtimeMetadata: entry.overtimeMetadata || null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
  }

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    const serverTime = getCurrentTime();

    return this.prisma.$transaction(
      async (tx) => {
        try {
          // 1. Validation
          const validationResult =
            await AttendanceValidators.validateProcessingOptions({
              ...options,
              checkTime: serverTime.toISOString(),
            });
          if (!validationResult.isValid) {
            throw new AppError({
              code: ErrorCode.INVALID_INPUT,
              message: validationResult.errors[0].message,
            });
          }

          // 2. Get context
          const [currentAttendance, periodContext] = await Promise.all([
            this.getLatestAttendance(options.employeeId),
            this.getPeriodContext(tx, options.employeeId, serverTime, options),
          ]);

          if (options.requireConfirmation && options.overtimeMissed) {
            const updatedAttendance = await this.handleAutoCompletionAttendance(
              tx,
              currentAttendance,
              options,
              periodContext,
            );

            const mappedAttendance =
              AttendanceMappers.toAttendanceRecord(updatedAttendance);
            if (!mappedAttendance) {
              throw new AppError({
                code: ErrorCode.PROCESSING_ERROR,
                message: 'Failed to map attendance record',
              });
            }

            const timeEntries = await this.timeEntryService.processTimeEntries(
              tx,
              mappedAttendance,
              {
                stateChange: {
                  state: {
                    previous: mappedAttendance.state,
                    current: AttendanceState.PRESENT,
                  },
                  checkStatus: {
                    previous: mappedAttendance.checkStatus,
                    current: CheckStatus.CHECKED_OUT,
                  },
                  overtime: periodContext.approvedOvertime
                    ? {
                        previous: { isOvertime: false },
                        current: {
                          isOvertime: true,
                          state: OvertimeState.COMPLETED,
                        },
                      }
                    : undefined,
                },
                timestamp: serverTime,
                reason: 'Auto-completion of missing entries',
              },
              {
                ...options,
                checkTime: serverTime.toISOString(),
              },
            );

            // Map time entries with proper types
            const mappedTimeEntries = {
              regular: timeEntries.regular
                ? this.mapTimeEntry(timeEntries.regular, false)
                : undefined,
              overtime: timeEntries.overtime?.map((entry) =>
                this.mapTimeEntry(entry, true),
              ),
            };

            return AttendanceResponseBuilder.createProcessingResponse(
              mappedAttendance,
              mappedTimeEntries,
              {
                isOvertime: Boolean(options.isOvertime),
                metadata: {
                  autoCompleted: true,
                  autoCompletedEntries: {
                    regular: timeEntries.regular
                      ? this.mapTimeEntry(timeEntries.regular, false)
                      : undefined,
                    overtime: timeEntries.overtime?.map((entry) =>
                      this.mapTimeEntry(entry, true),
                    ),
                  },
                },
              },
            );
          } else {
            // Normal processing flow
            const statusUpdate = await StatusHelpers.processStatusTransition(
              currentAttendance
                ? AttendanceMappers.toCompositeStatus(currentAttendance)
                : this.getInitialStatus(),
              {
                ...options,
                checkTime: serverTime.toISOString(),
              },
            );

            const processedAttendance = await this.processAttendanceChange(
              tx,
              currentAttendance,
              statusUpdate,
              {
                ...options,
                checkTime: serverTime.toISOString(),
              },
              periodContext,
            );

            // 5. Process time entries
            const timeEntries = await this.timeEntryService.processTimeEntries(
              tx,
              processedAttendance,
              statusUpdate,
              {
                ...options,
                checkTime: serverTime.toISOString(),
              },
            );

            // Map time entries with proper types
            const mappedTimeEntries = {
              regular: timeEntries.regular
                ? this.mapTimeEntry(timeEntries.regular, false)
                : undefined,
              overtime: timeEntries.overtime?.map((entry) =>
                this.mapTimeEntry(entry, true),
              ),
            };

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
          }
        } catch (error) {
          console.error('Process attendance error:', {
            error,
            employeeId: options.employeeId,
            timestamp: serverTime,
          });
          throw this.handleProcessingError(error);
        }
      },
      {
        timeout: 8000,
      },
    );
  }

  private async handleAutoCompletionAttendance(
    tx: Prisma.TransactionClient,
    attendance: AttendanceRecord | null,
    options: ProcessingOptions,
    context: AttendancePeriodContext,
  ): Promise<
    Prisma.AttendanceGetPayload<{
      include: { timeEntries: true; overtimeEntries: true };
    }>
  > {
    const now = getCurrentTime();

    const baseData = {
      CheckInTime: context.shiftTimes.start,
      CheckOutTime: context.approvedOvertime
        ? parseISO(
            `${format(now, 'yyyy-MM-dd')}T${context.approvedOvertime.startTime}`,
          )
        : context.shiftTimes.end,
      state: 'PRESENT', // Use string literal
      checkStatus: 'CHECKED_OUT', // Use string literal
      isOvertime: false,
      shiftStartTime: context.shiftTimes.start,
      shiftEndTime: context.shiftTimes.end,
    };

    if (!attendance) {
      // Create new attendance record
      return tx.attendance.create({
        data: {
          employeeId: options.employeeId!,
          date: startOfDay(now),
          version: 1,
          state: 'PRESENT', // Use string literal
          checkStatus: 'CHECKED_OUT', // Use string literal
          CheckInTime: context.shiftTimes.start,
          CheckOutTime: context.approvedOvertime
            ? parseISO(
                `${format(now, 'yyyy-MM-dd')}T${context.approvedOvertime.startTime}`,
              )
            : context.shiftTimes.end,
          isOvertime: false,
          shiftStartTime: context.shiftTimes.start,
          shiftEndTime: context.shiftTimes.end,
          timeEntries: {
            create: [
              {
                employeeId: options.employeeId!,
                date: startOfDay(now),
                startTime: context.shiftTimes.start,
                endTime: context.shiftTimes.end,
                status: 'COMPLETED',
                entryType: 'REGULAR',
                regularHours: 0, // Adjust as needed
                overtimeHours: 0,
              },
            ],
          },
          overtimeEntries: context.approvedOvertime
            ? {
                create: [
                  {
                    actualStartTime: parseISO(
                      `${format(now, 'yyyy-MM-dd')}T${context.approvedOvertime.startTime}`,
                    ),
                    actualEndTime: parseISO(
                      `${format(now, 'yyyy-MM-dd')}T${context.approvedOvertime.endTime}`,
                    ),
                    overtimeRequestId: context.approvedOvertime.id, // Assuming there's an ID
                  },
                ],
              }
            : undefined,
        },
        include: {
          timeEntries: true,
          overtimeEntries: true,
        },
      });
    }

    // Update existing record
    return tx.attendance.update({
      where: { id: attendance.id },
      data: {
        ...baseData,
        state: { set: 'PRESENT' }, // Use Prisma's set operation
        checkStatus: { set: 'CHECKED_OUT' }, // Use Prisma's set operation
        isOvertime: !!context.approvedOvertime,
        overtimeState: context.approvedOvertime
          ? { set: 'COMPLETED' } // Use Prisma's set operation
          : undefined,
        timeEntries: {
          create: [], // Explicitly handle timeEntries
        },
        overtimeEntries: {
          create: [], // Explicitly handle overtimeEntries
        },
      },
      include: {
        timeEntries: true,
        overtimeEntries: true,
      },
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
    options: ProcessingOptions,
  ): Promise<AttendancePeriodContext> {
    const startDate = startOfDay(checkTime);
    const endDate = endOfDay(checkTime);

    const [shift, overtime, leave, holiday] = await Promise.all([
      this.shiftService.getEffectiveShiftAndStatus(employeeId, checkTime),
      this.overtimeService.getCurrentApprovedOvertimeRequest(
        employeeId,
        checkTime,
      ),
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
      approvedOvertime: null,
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
      ? {
          lat: location.lat,
          lng: location.lng,
          accuracy: location.accuracy,
          timestamp: location.timestamp,
          provider: location.provider,
        }
      : null;

    // Prepare data with careful type handling
    const attendanceData: Prisma.AttendanceUncheckedCreateInput = {
      employeeId: options.employeeId!,
      date: startDate,
      version: 1,
      state:
        statusUpdate.stateChange.state.current === undefined
          ? undefined
          : (statusUpdate.stateChange.state.current as
              | AttendanceState
              | undefined),
      checkStatus:
        statusUpdate.stateChange.checkStatus.current === undefined
          ? undefined
          : (statusUpdate.stateChange.checkStatus.current as
              | CheckStatus
              | undefined),
      isOvertime:
        statusUpdate.stateChange.overtime?.current?.isOvertime || false,
      overtimeState: statusUpdate.stateChange.overtime?.current?.state,
      ...(isCheckIn
        ? {
            CheckInTime: date,
            checkInLocation: locationData,
          }
        : {
            CheckOutTime: date,
            checkOutLocation: locationData,
          }),
      shiftStartTime: context.shiftTimes.start,
      shiftEndTime: context.shiftTimes.end,
      isDayOff: context.isDayOff,
      isManualEntry: options.isManualEntry || false,
    };

    const timeEntryData = isCheckIn
      ? [
          {
            employeeId: options.employeeId!,
            date: startDate,
            startTime: date,
            endTime: null,
            status: 'STARTED',
            entryType: options.entryType || 'REGULAR',
            regularHours: 0,
            overtimeHours: 0,
            isHalfDayLate: false,
            actualMinutesLate: 0,
          },
        ]
      : undefined;

    const updatedAttendance = await tx.attendance.upsert({
      where: {
        employee_date_attendance: {
          employeeId: options.employeeId!,
          date: startDate,
        },
      },
      create: {
        ...attendanceData,
        timeEntries: timeEntryData
          ? {
              create: timeEntryData,
            }
          : undefined,
      },
      update: {
        ...attendanceData,
        timeEntries: timeEntryData
          ? {
              create: timeEntryData,
            }
          : undefined,
      },
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

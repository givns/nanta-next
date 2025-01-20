// services/Attendance/AttendanceService.ts
import { Attendance, PeriodType, PrismaClient } from '@prisma/client';
import { AttendanceProcessingService } from './AttendanceProcessingService';
import { AttendanceStatusService } from './AttendanceStatusService';
import {
  ProcessingOptions,
  ProcessingResult,
  AttendanceStatusResponse,
  SerializedAttendanceRecord,
  StateValidation,
} from '../../types/attendance';
import { ShiftManagementService } from '../ShiftManagementService/ShiftManagementService';
import { AttendanceMappers } from './utils/AttendanceMappers';
import { AttendanceEnhancementService } from './AttendanceEnhancementService';
import { PeriodManagementService } from './PeriodManagementService';
import { CacheManager } from '../cache/CacheManager';
import { TimeEntryService } from '../TimeEntryService';
import { AttendanceRecordService } from './AttendanceRecordService';

export class AttendanceService {
  private readonly processingService: AttendanceProcessingService;
  private readonly statusService: AttendanceStatusService;

  constructor(
    prisma: PrismaClient,
    shiftService: ShiftManagementService,
    enhancementService: AttendanceEnhancementService,
    periodManager: PeriodManagementService,
    cacheManager: CacheManager,
    timeEntryService: TimeEntryService,
    attendanceRecordService: AttendanceRecordService,
  ) {
    this.mappers = new AttendanceMappers(); // Add mapper instance

    // Initialize specialized services
    this.processingService = new AttendanceProcessingService(
      prisma,
      shiftService,
      timeEntryService,
      enhancementService,
      periodManager,
    );
    this.statusService = new AttendanceStatusService( // Initialize the property
      shiftService,
      enhancementService,
      attendanceRecordService,
      cacheManager,
      periodManager,
    );
  }

  private readonly mappers: AttendanceMappers;

  async processAttendance(
    options: ProcessingOptions,
  ): Promise<ProcessingResult> {
    return this.processingService.processAttendance(options);
  }

  async getAttendanceStatus(
    employeeId: string,
    options: {
      inPremises: boolean;
      address: string;
      periodType?: PeriodType;
    },
  ): Promise<AttendanceStatusResponse> {
    return this.statusService.getAttendanceStatus(employeeId, options);
  }

  async validateCheckInOut(
    employeeId: string,
    options: {
      inPremises: boolean;
      address: string;
      periodType?: PeriodType;
    },
  ): Promise<StateValidation> {
    const status = await this.getAttendanceStatus(employeeId, options);

    return status.validation;
  }

  async getSerializedAttendance(
    employeeId: string,
  ): Promise<SerializedAttendanceRecord | null> {
    const record =
      await this.statusService.getLatestAttendanceRecord(employeeId);
    return record
      ? AttendanceMappers.toSerializedAttendanceRecord(record)
      : null;
  }
}

/** @deprecated Use validateCheckInOut with new StateValidation return type */
//async isCheckInOutAllowed(

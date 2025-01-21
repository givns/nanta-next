// services/ServiceInitializer.ts

import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { AttendanceService } from './Attendance/AttendanceService';
import { AttendanceEnhancementService } from './Attendance/AttendanceEnhancementService';
import { PeriodManagementService } from './Attendance/PeriodManagementService';
import { TimeEntryService } from './TimeEntryService';
import { CacheManager } from './cache/CacheManager';
import { AttendanceRecordService } from './Attendance/AttendanceRecordService';
import { AttendanceStatusService } from './Attendance/AttendanceStatusService';
import { HolidayService } from './HolidayService';
import { NotificationService } from './NotificationService';
import { createLeaveServiceServer } from './LeaveServiceServer';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { LocationAssistanceService } from './location/LocationAssistanceService';

export async function initializeServices(prisma: PrismaClient) {
  // Initialize supporting services first
  const holidayService = new HolidayService(prisma);
  const notificationService = new NotificationService(prisma);
  const attendanceRecordService = new AttendanceRecordService(prisma);

  // Initialize base services
  const shiftService = new ShiftManagementService(prisma, holidayService);

  const periodManager = new PeriodManagementService(shiftService);

  // Create leave service
  const leaveService = await createLeaveServiceServer(
    prisma,
    notificationService,
  );

  // Create overtime service with correct order of dependencies
  const overtimeService = new OvertimeServiceServer(
    prisma,
    holidayService,
    leaveService,
    shiftService,
    notificationService,
  );

  // Set the overtime service in shiftService - ADD THIS LINE
  shiftService.setOvertimeService(overtimeService);

  // Initialize time entry service with correct order of dependencies
  const timeEntryService = new TimeEntryService(
    prisma,
    notificationService,
    overtimeService,
    leaveService,
    shiftService,
  );

  // Initialize enhancement service
  const enhancementService = new AttendanceEnhancementService(periodManager);

  // Initialize CacheManager
  let cacheManager: CacheManager;
  try {
    await CacheManager.initialize(prisma, shiftService, enhancementService);
    const instance = CacheManager.getInstance();
    if (!instance) {
      throw new Error('Failed to initialize CacheManager');
    }
    cacheManager = instance;
  } catch (error) {
    console.warn('CacheManager initialization failed:', error);
    throw error; // Re-throw as services require CacheManager
  }

  // Initialize attendance-related services
  const statusService = new AttendanceStatusService(
    shiftService,
    enhancementService,
    attendanceRecordService,
    cacheManager,
    periodManager,
  );

  const attendanceService = new AttendanceService(
    prisma,
    shiftService,
    enhancementService,
    periodManager,
    cacheManager,
    timeEntryService,
    attendanceRecordService,
  );

  const locationAssistanceService = new LocationAssistanceService(
    prisma,
    notificationService,
  );

  return {
    shiftService,
    enhancementService,
    periodManager,
    timeEntryService,
    attendanceService,
    statusService,
    attendanceRecordService,
    holidayService,
    notificationService,
    leaveService,
    overtimeService,
    locationAssistanceService,
  };
}

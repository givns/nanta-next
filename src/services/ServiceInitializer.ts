import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { HolidayService } from './HolidayService';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { NotificationService } from './NotificationService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { TimeEntryService } from './TimeEntryService';
import { AttendanceRecordService } from './Attendance/AttendanceRecordService';
import { PeriodManagementService } from './Attendance/PeriodManagementService';
import { CacheManager } from './cache/CacheManager';
import { AttendanceStatusService } from './Attendance/AttendanceStatusService';
import { AttendanceEnhancementService } from './Attendance/AttendanceEnhancementService';
import { AttendanceService } from './Attendance/AttendanceService';

export const initializeServices = (prisma: PrismaClient) => {
  // Basic services
  const holidayService = new HolidayService(prisma);
  const notificationService = new NotificationService(prisma);
  const attendanceRecordService = new AttendanceRecordService(prisma);
  const periodManager = new PeriodManagementService();
  const enhancementService = new AttendanceEnhancementService(periodManager);
  const cacheManager = CacheManager.getInstance();

  // Initialize services with circular dependencies first as placeholders
  let overtimeService: OvertimeServiceServer;
  let timeEntryService: TimeEntryService;

  const shiftService = new ShiftManagementService(
    prisma,
    holidayService,
    attendanceRecordService,
  );
  const leaveService = new LeaveServiceServer(prisma, notificationService);
  const attendanceStatusService = new AttendanceStatusService(
    shiftService,
    enhancementService,
    attendanceRecordService,
    cacheManager,
  );

  // Create temporary overtimeService without TimeEntryService
  overtimeService = new OvertimeServiceServer(
    prisma,
    holidayService,
    leaveService,
    shiftService,
    undefined as any, // Temporary undefined for circular dependency
    notificationService,
  );

  // Create TimeEntryService with temporary overtimeService
  timeEntryService = new TimeEntryService(
    prisma,
    notificationService,
    overtimeService,
    leaveService,
    shiftService,
  );

  // Now update overtimeService with proper TimeEntryService reference
  Object.defineProperty(overtimeService, 'timeEntryService', {
    value: timeEntryService,
    writable: false,
    configurable: false,
  });

  // Set up interdependencies
  shiftService.setOvertimeService(overtimeService);

  const attendanceService = new AttendanceService(
    prisma,
    shiftService,
    enhancementService,
    periodManager,
    cacheManager,
    timeEntryService,
    attendanceRecordService,
  );

  return {
    shiftService,
    holidayService,
    leaveService,
    overtimeService,
    notificationService,
    timeEntryService,
    attendanceRecordService,
    periodManager,
    cacheManager,
    attendanceStatusService,
    enhancementService,
    attendanceService,
  };
};

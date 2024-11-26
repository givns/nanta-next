import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { HolidayService } from './HolidayService';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { NotificationService } from './NotificationService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { TimeEntryService } from './TimeEntryService';

export const initializeServices = (prisma: PrismaClient) => {
  // Basic services
  const holidayService = new HolidayService(prisma);
  const notificationService = new NotificationService(prisma);

  // Initialize services with circular dependencies first as placeholders
  let overtimeService: OvertimeServiceServer;
  let timeEntryService: TimeEntryService;

  const shiftService = new ShiftManagementService(prisma, holidayService);
  const leaveService = new LeaveServiceServer(prisma, notificationService);

  if (process.env.NODE_ENV === 'test') {
    // In test mode, create mock services
    overtimeService = {
      getApprovedOvertimeRequest: async () => null,
      // ... other required methods with test implementations
    } as unknown as OvertimeServiceServer;

    timeEntryService = new TimeEntryService(
      prisma,
      notificationService,
      overtimeService,
      leaveService,
      shiftService,
    );
  } else {
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
  }

  // Set up interdependencies
  shiftService.setOvertimeService(overtimeService);

  return {
    shiftService,
    holidayService,
    leaveService,
    overtimeService,
    notificationService,
    timeEntryService,
  };
};

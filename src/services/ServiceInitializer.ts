import { PrismaClient } from '@prisma/client';
import { ShiftManagementService } from './ShiftManagementService/ShiftManagementService';
import { HolidayService } from './HolidayService';
import { OvertimeServiceServer } from './OvertimeServiceServer';
import { NotificationService } from './NotificationService';
import { LeaveServiceServer } from './LeaveServiceServer';
import { TimeEntryService } from './TimeEntryService';

export const initializeServices = (prisma: PrismaClient) => {
  const holidayService = new HolidayService(prisma);
  const notificationService = new NotificationService(prisma);

  // Initialize services with circular dependencies first as placeholders
  let overtimeService: OvertimeServiceServer | null = null;

  const shiftService = new ShiftManagementService(prisma, holidayService);
  const leaveService = new LeaveServiceServer(prisma, notificationService);

  // Initialize TimeEntryService with a placeholder for overtimeService
  const timeEntryService = new TimeEntryService(
    prisma,
    notificationService,
    overtimeService!, // Use non-null assertion as this will be reassigned below
    leaveService,
    shiftService,
  );

  // Now initialize OvertimeServiceServer with timeEntryService
  overtimeService = new OvertimeServiceServer(
    prisma,
    holidayService,
    leaveService,
    shiftService,
    timeEntryService,
    notificationService,
  );

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

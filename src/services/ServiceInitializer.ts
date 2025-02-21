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
import { TimeWindowManager } from '@/utils/timeWindow/TimeWindowManager';
import { PeriodStateResolver } from './Attendance/PeriodStateResolver';

// Create a "no-op" cache manager class that implements the same interface
// but doesn't actually do any caching
class NullCacheManager {
  async getAttendanceState() {
    return null;
  }

  async cacheAttendanceState() {
    // Do nothing
    return;
  }

  async invalidateCache() {
    // Do nothing
    return;
  }
}

// Define the services return type for TypeScript
export type InitializedServices = {
  timeWindowManager: TimeWindowManager;
  stateResolver: PeriodStateResolver;
  periodManager: PeriodManagementService;
  enhancementService: AttendanceEnhancementService;
  shiftService: ShiftManagementService;
  timeEntryService: TimeEntryService;
  attendanceService: AttendanceService;
  statusService: AttendanceStatusService;
  attendanceRecordService: AttendanceRecordService;
  holidayService: HolidayService;
  notificationService: NotificationService;
  leaveService: any; // Use proper type when available
  overtimeService: OvertimeServiceServer;
  locationAssistanceService: LocationAssistanceService;
  cacheManager: CacheManager | NullCacheManager; // Allow our fallback implementation
};

export async function initializeServices(
  prisma: PrismaClient,
): Promise<InitializedServices> {
  // Initialize the TimeWindowManager first as it's a dependency for other services
  const timeWindowManager = new TimeWindowManager();

  // Initialize supporting services
  const holidayService = new HolidayService(prisma);
  const notificationService = new NotificationService(prisma);
  const attendanceRecordService = new AttendanceRecordService(prisma);

  // Initialize the state resolver with time window manager
  const stateResolver = new PeriodStateResolver(timeWindowManager);

  // Initialize ShiftService
  const shiftService = new ShiftManagementService(prisma, holidayService);

  // Initialize period manager with dependencies
  const periodManager = new PeriodManagementService(
    shiftService,
    timeWindowManager,
    stateResolver,
  );

  // Initialize enhancement service with dependencies
  const enhancementService = new AttendanceEnhancementService(
    periodManager,
    stateResolver,
    timeWindowManager,
  );

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

  // Set the overtime service in shiftService
  shiftService.setOvertimeService(overtimeService);

  // Initialize time entry service
  const timeEntryService = new TimeEntryService(
    prisma,
    notificationService,
    overtimeService,
    leaveService,
    shiftService,
  );

  // Initialize CacheManager
  // We can't directly create a CacheManager instance since its constructor is private
  let cacheManager: CacheManager | NullCacheManager;
  try {
    // Try to initialize and get the singleton instance
    await CacheManager.initialize(prisma, shiftService, enhancementService);
    const instance = CacheManager.getInstance();

    if (instance) {
      cacheManager = instance;
    } else {
      console.warn(
        'CacheManager initialization completed but getInstance returned null, using NullCacheManager',
      );
      cacheManager = new NullCacheManager();
    }
  } catch (error) {
    console.warn(
      'CacheManager initialization failed, using NullCacheManager:',
      error,
    );
    cacheManager = new NullCacheManager();
  }

  // Initialize attendance status service with our cache manager (real or null)
  const statusService = new AttendanceStatusService(
    shiftService,
    enhancementService,
    attendanceRecordService,
    cacheManager as any, // Use type assertion to satisfy TypeScript
    periodManager,
  );

  // Initialize attendance service with our cache manager (real or null)
  const attendanceService = new AttendanceService(
    prisma,
    shiftService,
    enhancementService,
    periodManager,
    cacheManager as any, // Use type assertion to satisfy TypeScript
    timeEntryService,
    attendanceRecordService,
  );

  // Initialize location assistance service
  const locationAssistanceService = new LocationAssistanceService(
    prisma,
    notificationService,
  );

  // Return all initialized services
  return {
    timeWindowManager,
    stateResolver,
    periodManager,
    enhancementService,
    shiftService,
    timeEntryService,
    attendanceService,
    statusService,
    attendanceRecordService,
    holidayService,
    notificationService,
    leaveService,
    overtimeService,
    locationAssistanceService,
    cacheManager,
  };
}

// For serverless environments, export a helper to lazy-initialize services
let servicesPromise: Promise<InitializedServices> | null = null;
let servicesInitialized = false;

export async function getServices(
  prisma: PrismaClient,
): Promise<InitializedServices> {
  if (!servicesPromise) {
    servicesPromise = initializeServices(prisma);
  }

  try {
    const services = await servicesPromise;
    servicesInitialized = true;
    return services;
  } catch (error) {
    // Reset the promise if initialization fails so next request can try again
    servicesPromise = null;
    console.error('Service initialization error:', error);
    throw error;
  }
}

// Helper to check if services are initialized
export function areServicesInitialized(): boolean {
  return servicesInitialized;
}

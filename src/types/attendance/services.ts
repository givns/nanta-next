// types/services.ts
import { AttendanceEnhancementService } from '@/services/Attendance/AttendanceEnhancementService';
import { AttendanceRecordService } from '@/services/Attendance/AttendanceRecordService';
import { AttendanceService } from '@/services/Attendance/AttendanceService';
import { PeriodManagementService } from '@/services/Attendance/PeriodManagementService';
import { ShiftManagementService } from '@/services/ShiftManagementService/ShiftManagementService';
import { TimeEntryService } from '@/services/TimeEntryService';
import { NotificationService } from '@/services/NotificationService';

export interface InitializedServices {
  attendanceService: AttendanceService;
  shiftService: ShiftManagementService;
  enhancementService: AttendanceEnhancementService;
  periodManager: PeriodManagementService;
  timeEntryService: TimeEntryService;
  attendanceRecordService: AttendanceRecordService;
  notificationService: NotificationService;
}

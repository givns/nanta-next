// utils/attendance.ts

import { TimeEntryWithDate } from '../types/attendance/utils';
import { TimeEntry } from '../types/attendance/records';

export function transformTimeEntry(raw: TimeEntry): TimeEntryWithDate {
  return {
    id: raw.id,
    employeeId: raw.employeeId,
    date: new Date(raw.date),
    startTime: raw.startTime ? new Date(raw.startTime) : null,
    endTime: raw.endTime ? new Date(raw.endTime) : null,
    regularHours: raw.regularHours,
    overtimeHours: raw.overtimeHours,
    status:
      raw.status.toLowerCase() === 'in_progress' ? 'in_progress' : 'completed',
    attendanceId: raw.attendanceId,
    overtimeRequestId: raw.overtimeRequestId,
    entryType: raw.entryType === 'overtime' ? 'overtime' : 'regular',
    isLate: false, // This should be calculated based on business logic
    isDayOff: false, // This should be calculated based on business logic
    overtimeMetadata: raw.overtimeMetadata
      ? {
          id: '', // Add the missing property 'id'
          timeEntryId: '', // Add the missing property 'timeEntryId'
          createdAt: new Date(), // Add the missing property 'createdAt'
          updatedAt: new Date(), // Add the missing property 'updatedAt'
          isDayOffOvertime: raw.overtimeMetadata.isDayOffOvertime,
          isInsideShiftHours: raw.overtimeMetadata.isInsideShiftHours,
        }
      : undefined,
  };
}

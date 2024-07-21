// jobs/syncExternalAttendance.ts

import { AttendanceSyncService } from '../../../services/AttendanceSyncService';

const syncService = new AttendanceSyncService();

export async function syncExternalAttendance() {
  console.log('Starting external attendance sync');
  try {
    await syncService.syncAttendanceData();
    console.log('External attendance sync completed successfully');
  } catch (error) {
    console.error('Error during external attendance sync:', error);
  }
}

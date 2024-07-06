// services/ExternalDbService.ts
import { query } from '../utils/mysqlConnection';
import {
  ExternalCheckInData,
  ExternalCheckInInputData,
  ExternalManualEntryInputData,
} from '../types/user';

export class ExternalDbService {
  async getLatestCheckIn(
    employeeId: string,
    shift: { startTime: string; endTime: string },
  ): Promise<ExternalCheckInData | null> {
    console.log(`Searching for external user with employeeId: ${employeeId}`);

    const now = new Date();
    const [startHour, startMinute] = shift.startTime.split(':').map(Number);
    const [endHour, endMinute] = shift.endTime.split(':').map(Number);

    const shiftStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      startHour,
      startMinute,
    );
    const shiftEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      endHour,
      endMinute,
    );

    // Adjust for midnight crossing
    if (shiftEnd < shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    // Look back 30 minutes before shift start and 30 minutes after shift end
    const searchStart = new Date(shiftStart.getTime() - 30 * 60000);
    const searchEnd = new Date(shiftEnd.getTime() + 30 * 60000);

    console.log(
      `Searching for check-ins between ${searchStart.toISOString()} and ${searchEnd.toISOString()}`,
    );

    try {
      const result = await query<ExternalCheckInData[]>(
        `SELECT * FROM kt_jl 
         WHERE user_serial = ? 
         AND sj BETWEEN ? AND ?
         AND dev_serial IN ('0010012', '0010000')
         ORDER BY sj DESC 
         LIMIT 1`,
        [employeeId, searchStart, searchEnd],
      );

      if (result.length > 0) {
        const checkInData = result[0];
        console.log('External check-in found:', checkInData);

        // Determine if it's a regular or fallback check-in
        if (checkInData.dev_serial === '0010012') {
          console.log('Regular check-in detected');
        } else if (checkInData.dev_serial === '0010000') {
          console.log('Fallback check-in detected');
        }

        // Check if the check-in time is within the allowed range
        const checkInTime = new Date(checkInData.sj);
        const isWithinAllowedTime = this.isWithinAllowedTimeRange(
          checkInTime,
          shiftStart,
          shiftEnd,
        );

        if (!isWithinAllowedTime) {
          console.log('Check-in time is outside the allowed range');
        }

        return checkInData;
      } else {
        console.log('No external check-in found');
        return null;
      }
    } catch (error) {
      console.error('Error in getLatestCheckIn:', error);
      return null;
    }
  }

  private isWithinAllowedTimeRange(
    checkTime: Date,
    shiftStart: Date,
    shiftEnd: Date,
  ): boolean {
    // Allow check-in up to 30 minutes before shift start and check-out up to 30 minutes after shift end
    const earliestAllowed = new Date(shiftStart.getTime() - 30 * 60000);
    const latestAllowed = new Date(shiftEnd.getTime() + 30 * 60000);

    return checkTime >= earliestAllowed && checkTime <= latestAllowed;
  }

  async createCheckIn(data: ExternalCheckInInputData) {
    await query(
      'INSERT INTO kt_jl (user_serial, sj, fx, dev_serial) VALUES (?, ?, ?, ?)',
      [data.employeeId, data.timestamp, data.checkType, data.deviceSerial],
    );
  }

  async updateCheckOut(data: ExternalCheckInInputData) {
    await query(
      'UPDATE kt_jl SET fx = ?, sj = ? WHERE user_serial = ? AND dev_serial = ? AND fx = 0 ORDER BY sj DESC LIMIT 1',
      [data.checkType, data.timestamp, data.employeeId, data.deviceSerial],
    );
  }

  async createManualEntry(data: ExternalManualEntryInputData) {
    await query(
      'INSERT INTO kt_jl (user_serial, sj, fx, dev_serial) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
      [
        data.employeeId,
        data.checkInTimestamp,
        0, // Assuming 0 is for check-in
        data.deviceSerial,
        data.employeeId,
        data.checkOutTimestamp || data.checkInTimestamp,
        1, // Assuming 1 is for check-out
        data.deviceSerial,
      ],
    );
  }
}

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
  ): Promise<ExternalCheckInData | null> {
    console.log(`Searching for external user with employeeId: ${employeeId}`);

    try {
      const result = await query<ExternalCheckInData[]>(
        'SELECT * FROM kt_jl WHERE user_no = ? ORDER BY sj DESC LIMIT 1',
        [employeeId],
      );

      if (result.length > 0) {
        const checkInData = result[0];
        console.log('External check-in found:', checkInData);
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

  async createCheckIn(data: ExternalCheckInInputData) {
    await query(
      'INSERT INTO kt_jl (user_no, sj, fx, dev_serial) VALUES (?, ?, ?, ?)',
      [data.employeeId, data.timestamp, data.checkType, data.deviceSerial],
    );
  }

  async updateCheckOut(data: ExternalCheckInInputData) {
    await query(
      'UPDATE kt_jl SET fx = ?, sj = ? WHERE user_no = ? AND dev_serial = ? AND fx = 0 ORDER BY sj DESC LIMIT 1',
      [data.checkType, data.timestamp, data.employeeId, data.deviceSerial],
    );
  }

  async createManualEntry(data: ExternalManualEntryInputData) {
    await query(
      'INSERT INTO kt_jl (user_no, sj, fx, dev_serial) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
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

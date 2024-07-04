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
    const result = await query<ExternalCheckInData[]>(
      'SELECT * FROM kt_jl WHERE user_serial = ? ORDER BY sj DESC LIMIT 1',
      [employeeId],
    );
    return result.length > 0 ? result[0] : null;
  }

  async createCheckIn(data: ExternalCheckInInputData) {
    await query(
      'INSERT INTO kt_jl (user_no, sj, fx, dev_serial) VALUES (?, ?, ?, ?)',
      [data.employeeId, data.timestamp, data.checkType ?? 0, data.deviceSerial],
    );
  }

  async updateCheckOut(data: ExternalCheckInInputData) {
    await query(
      'UPDATE kt_jl SET fx = ?, sj = ? WHERE user_no = ? AND dev_serial = ? AND fx = 0 ORDER BY sj DESC LIMIT 1',
      [data.checkType ?? 1, data.timestamp, data.employeeId, data.deviceSerial],
    );
  }

  async createManualEntry(data: ExternalManualEntryInputData) {
    await query(
      'INSERT INTO kt_jl (user_serial, sj, fx, dev_serial) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
      [
        data.employeeId,
        data.checkInTimestamp,
        0,
        data.deviceSerial,
        data.employeeId,
        data.checkOutTimestamp || data.checkInTimestamp,
        1,
        data.deviceSerial,
      ],
    );
  }
}

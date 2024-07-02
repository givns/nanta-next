// services/ExternalDbService.ts
import { query } from '../utils/mysqlConnection';
import { ExternalCheckInData } from '../types/user';

interface ExternalCheckInInputData {
  employeeId: string;
  timestamp: Date;
  checkType: number;
  deviceSerial: string;
}

interface ExternalManualEntryInputData {
  employeeId: string;
  checkInTimestamp: Date;
  checkOutTimestamp?: Date;
  deviceSerial: string;
}

export class ExternalDbService {
  async getLatestCheckIn(
    employeeId: string,
  ): Promise<ExternalCheckInData | null> {
    const result = await query<ExternalCheckInData>(
      'SELECT * FROM kt_jl WHERE user_serial = ? ORDER BY sj DESC LIMIT 1',
      [employeeId],
    );
    return result[0] || null;
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

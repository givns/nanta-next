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
  ): Promise<{ checkIn: ExternalCheckInData | null; userInfo: any | null }> {
    console.log(`Searching for external user with employeeId: ${employeeId}`);

    const userInfoQuery = 'SELECT * FROM dt_user WHERE user_no = ?';
    const checkInQuery = `
      SELECT kj.*, du.user_no, du.user_lname, du.user_fname, dd.dep_name as department
      FROM kt_jl kj
      JOIN dt_user du ON kj.user_serial = du.user_serial
      LEFT JOIN dt_dep dd ON du.user_dep = dd.dep_serial
      WHERE du.user_no = ?
      ORDER BY kj.sj DESC
      LIMIT 1
    `;

    try {
      const [userInfoResult, checkInResult] = await Promise.all([
        query<any[]>(userInfoQuery, [employeeId]),
        query<ExternalCheckInData[]>(checkInQuery, [employeeId]),
      ]);

      console.log('User info result:', JSON.stringify(userInfoResult, null, 2));
      console.log('Check-in result:', JSON.stringify(checkInResult, null, 2));

      return {
        userInfo: userInfoResult.length > 0 ? userInfoResult[0] : null,
        checkIn: checkInResult.length > 0 ? checkInResult[0] : null,
      };
    } catch (error) {
      console.error('Error in getLatestCheckIn:', error);
      return { userInfo: null, checkIn: null };
    }
  }

  async createCheckIn(data: ExternalCheckInInputData) {
    const sqlQuery =
      'INSERT INTO kt_jl (user_serial, sj, fx, dev_serial, date, time) VALUES (?, ?, ?, ?, ?, ?)';
    const checkTime = new Date(data.timestamp);
    const params = [
      data.employeeId,
      data.timestamp,
      data.checkType,
      data.deviceSerial,
      checkTime.toISOString().split('T')[0], // date
      checkTime.toTimeString().split(' ')[0], // time
    ];

    console.log('Creating check-in with query:', sqlQuery);
    console.log('Parameters:', params);

    try {
      const result = await query<any>(sqlQuery, params);
      console.log(
        'Check-in created successfully. Inserted ID:',
        result.insertId,
      );
      return result;
    } catch (error) {
      console.error('Error creating check-in:', error);
      throw error;
    }
  }

  async createManualEntry(data: ExternalManualEntryInputData) {
    const sqlQuery =
      'INSERT INTO kt_jl (user_serial, sj, fx, dev_serial, date, time) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)';
    const checkInTime = new Date(data.checkInTimestamp);
    const checkOutTime = new Date(
      data.checkOutTimestamp || data.checkInTimestamp,
    );
    const params = [
      data.employeeId,
      data.checkInTimestamp,
      0, // Check-in
      data.deviceSerial,
      checkInTime.toISOString().split('T')[0], // date
      checkInTime.toTimeString().split(' ')[0], // time
      data.employeeId,
      data.checkOutTimestamp || data.checkInTimestamp,
      1, // Check-out
      data.deviceSerial,
      checkOutTime.toISOString().split('T')[0], // date
      checkOutTime.toTimeString().split(' ')[0], // time
    ];

    console.log('Creating manual entry with query:', sqlQuery);
    console.log('Parameters:', params);

    try {
      const result = await query<any>(sqlQuery, params);
      console.log(
        'Manual entry created successfully. Inserted ID:',
        result.insertId,
      );
      return result;
    } catch (error) {
      console.error('Error creating manual entry:', error);
      throw error;
    }
  }
  async getLatestCheckOut(
    employeeId: string,
  ): Promise<{ checkOut: ExternalCheckInData | null }> {
    console.log(`Searching for latest check-out for employeeId: ${employeeId}`);

    const checkOutQuery = `
        SELECT kj.*, du.user_no, du.user_lname, du.user_fname, dd.dep_name as department
        FROM kt_jl kj
        JOIN dt_user du ON kj.user_serial = du.user_serial
        LEFT JOIN dt_dep dd ON du.user_dep = dd.dep_serial
        WHERE du.user_no = ? AND kj.fx = 1  -- Assuming fx = 1 for check-out
        ORDER BY kj.sj DESC
        LIMIT 1
      `;

    try {
      const checkOutResult = await query<ExternalCheckInData[]>(checkOutQuery, [
        employeeId,
      ]);

      console.log('Check-out result:', JSON.stringify(checkOutResult, null, 2));

      return {
        checkOut: checkOutResult.length > 0 ? checkOutResult[0] : null,
      };
    } catch (error) {
      console.error('Error in getLatestCheckOut:', error);
      return { checkOut: null };
    }
  }
}

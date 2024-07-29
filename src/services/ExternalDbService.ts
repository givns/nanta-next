// services/ExternalDbService.ts

import { query } from '../utils/mysqlConnection';
import {
  ExternalCheckInData,
  ExternalCheckInInputData,
  ExternalManualEntryInputData,
} from '../types/user';
import { retry } from '../utils/retry';
import { logMessage } from '../utils/inMemoryLogger';
import moment from 'moment-timezone';
import { createLogger } from '../utils/loggers';

const logger = createLogger('ExternalDbService');

interface ExternalUserInfo {
  user_serial: number | string;
  user_no: string;
  user_fname?: string;
  user_lname?: string;
  user_photo: string;
  department: string;
  user_depname: string;
  user_dep: string;
  bh: number;
  fx: number;
  iden: string | null;
  dev_serial: string;
  dev_state: number;
  jlzp_serial: number | null;
  gly_no: string | null;
  lx: number;
  shenhe: number;
  yich: number;
  deal_state: number;
  dev_logic_bh: number | null;
  healthstatus: number | null;
  body_temp: string | null;
  temp_error: string | null;
  passport_no: string | null;
}

export class ExternalDbService {
  async getDailyAttendanceRecords(
    employeeId: string,
    days: number = 1,
  ): Promise<{
    records: ExternalCheckInData[];
    userInfo: ExternalUserInfo | null;
  }> {
    return retry(
      async () => {
        console.log(
          `Searching for external user with employeeId: ${employeeId}`,
        );

        const userInfoQuery = 'SELECT * FROM dt_user WHERE user_no = ?';
        const attendanceQuery = `
    SELECT kj.sj, kj.user_serial, kj.bh, kj.dev_serial, kj.date, kj.time,
           du.user_no, du.user_lname, du.user_fname, dd.dep_name as department
    FROM kt_jl kj
    JOIN dt_user du ON kj.user_serial = du.user_serial
    LEFT JOIN dt_dep dd ON du.user_dep = dd.dep_serial
    WHERE du.user_no = ? 
    AND kj.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
    AND kj.date <= DATE_ADD(CURDATE(), INTERVAL 1 DAY)
    ORDER BY kj.sj ASC
  `;

        const [userInfoResult, attendanceResult] = await Promise.all([
          query<any[]>(userInfoQuery, [employeeId]),
          query<ExternalCheckInData[]>(attendanceQuery, [employeeId, days]),
        ]);

        console.log(
          'Raw attendance records:',
          JSON.stringify(attendanceResult, null, 2),
        );

        attendanceResult.forEach((record) => {
          logMessage(`Raw sj value for record ${record.bh}: ${record.sj}`);
        });

        const processedRecords = attendanceResult.map((record) => ({
          ...record,
          sj: moment.tz(record.sj, 'Asia/Bangkok').format(),
        }));

        console.log(
          'Processed attendance records:',
          JSON.stringify(processedRecords, null, 2),
        );

        logger.info(
          `Found ${attendanceResult.length} attendance records for employeeId: ${employeeId}`,
        );

        return {
          userInfo: userInfoResult.length > 0 ? userInfoResult[0] : null,
          records: processedRecords,
        };
      },
      3,
      1000,
    ); // Retry 3 times with 1 second delay between attempts
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

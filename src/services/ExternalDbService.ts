// services/ExternalDbService.ts

import { query } from '../utils/mysqlConnection';
import {
  ExternalCheckInData,
  ExternalCheckInInputData,
  ExternalManualEntryInputData,
} from '../types/user';

type QueryResult = {
  affectedRows?: number;
  insertId?: number;
  warningStatus?: number;
};

export class ExternalDbService {
  async testConnection(): Promise<boolean> {
    try {
      await query<any[]>('SELECT 1');
      console.log('Successfully connected to external database');
      return true;
    } catch (error) {
      console.error('Failed to connect to external database:', error);
      return false;
    }
  }

  async getLatestCheckIn(
    employeeId: string,
    shift: { startTime: string; endTime: string },
  ): Promise<ExternalCheckInData | null> {
    console.log(`Searching for external user with employeeId: ${employeeId}`);

    const now = new Date();
    const searchStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // Look back 30 days
    const searchEnd = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes into the future

    console.log(
      `Searching for check-ins between ${searchStart.toISOString()} and ${searchEnd.toISOString()}`,
    );

    const sqlQuery = `
      SELECT * FROM kt_jl 
      WHERE user_serial = ?
      AND sj BETWEEN ? AND ?
      ORDER BY sj DESC 
      LIMIT 1
    `;

    const params = [parseInt(employeeId, 10), searchStart, searchEnd];

    console.log('SQL Query:', sqlQuery);
    console.log('Query parameters:', params);

    try {
      const result = await query<ExternalCheckInData[]>(sqlQuery, params);

      console.log('Raw query results:', result);

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

  interpretCheckType(fx: number): string {
    switch (fx) {
      case 0:
        return 'Check In';
      case 1:
        return 'Check Out';
      case 2:
        return 'Break Start';
      case 5:
        return 'Overtime Start';
      case 6:
        return 'Overtime End';
      default:
        return 'Unknown';
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
      const result = await query<QueryResult>(sqlQuery, params);
      console.log(
        'Check-in created successfully. Inserted ID:',
        result.insertId,
      );
    } catch (error) {
      console.error('Error creating check-in:', error);
      throw error;
    }
  }

  async updateCheckOut(data: ExternalCheckInInputData) {
    const sqlQuery =
      'UPDATE kt_jl SET fx = ?, sj = ?, date = ?, time = ? WHERE user_serial = ? AND dev_serial = ? AND fx = 0 ORDER BY sj DESC LIMIT 1';
    const checkTime = new Date(data.timestamp);
    const params = [
      data.checkType,
      data.timestamp,
      checkTime.toISOString().split('T')[0], // date
      checkTime.toTimeString().split(' ')[0], // time
      data.employeeId,
      data.deviceSerial,
    ];

    console.log('Updating check-out with query:', sqlQuery);
    console.log('Parameters:', params);

    try {
      const result = await query<QueryResult>(sqlQuery, params);
      console.log(
        'Check-out updated successfully. Affected rows:',
        result.affectedRows,
      );
      if (result.affectedRows === 0) {
        console.warn(
          'No rows were updated. This might indicate a missing check-in record.',
        );
      }
    } catch (error) {
      console.error('Error updating check-out:', error);
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
      const result = await query<QueryResult>(sqlQuery, params);
      console.log(
        'Manual entry created successfully. Inserted ID:',
        result.insertId,
      );
    } catch (error) {
      console.error('Error creating manual entry:', error);
      throw error;
    }
  }

  async runDiagnosticQueries() {
    console.log('Running diagnostic queries on external database...');
    const results: any = {};

    try {
      // Query 1: Get all columns and a sample of data
      results.sampleData = await query<any[]>('SELECT * FROM kt_jl LIMIT 10');

      // Query 2: Get all check-in/out records for users 1001, 100001, and 100271
      const userCheckInQuery = `
        SELECT * FROM kt_jl 
        WHERE user_serial IN ('1001', '100001', '100271') 
        ORDER BY sj DESC 
        LIMIT 50
      `;
      results.userCheckInData = await query<any[]>(userCheckInQuery);

      // Query 3: Get the most recent check-in for each user
      const recentCheckInsQuery = `
        SELECT user_serial, MAX(sj) as latest_checkin
        FROM kt_jl
        WHERE user_serial IN ('1001', '100001', '100271')
        GROUP BY user_serial
      `;
      results.recentCheckIns = await query<any[]>(recentCheckInsQuery);

      // Query 4: Get table structure
      try {
        results.tableStructure = await query<any[]>('DESCRIBE kt_jl');
      } catch (error) {
        results.tableStructureError =
          'Unable to fetch table structure. This might require additional permissions.';
      }

      // Query 5: Get unique user_serial values
      const uniqueUsersQuery = `
        SELECT DISTINCT user_serial
        FROM kt_jl
        WHERE user_serial IN ('1001', '100001', '100271', '001001')
      `;
      results.uniqueUsers = await query<any[]>(uniqueUsersQuery);
    } catch (error: any) {
      console.error('Error running diagnostic queries:', error);
      results.error = error.message;
    }

    return results;
  }
}

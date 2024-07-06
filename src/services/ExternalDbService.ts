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

    // Look back 24 hours and 30 minutes into the future
    const searchStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // Look back 7 days
    const searchEnd = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes into the future

    console.log(
      `Searching for check-ins between ${searchStart.toISOString()} and ${searchEnd.toISOString()}`,
    );

    const normalizedEmployeeId = employeeId.padStart(6, '0');

    const sqlQuery = `
      SELECT * FROM kt_jl 
      WHERE user_serial = ? 
      AND sj BETWEEN ? AND ?
      AND dev_serial IN ('0010012', '0010000')
      ORDER BY sj DESC 
      LIMIT 1
    `;

    console.log('SQL Query:', sqlQuery);
    console.log('Query parameters:', [
      normalizedEmployeeId,
      searchStart,
      searchEnd,
    ]);

    try {
      const result = await query<ExternalCheckInData[]>(sqlQuery, [
        normalizedEmployeeId,
        searchStart,
        searchEnd,
      ]);

      console.log('Raw query results:', result);

      if (result.length > 0) {
        const checkInData = result[0];
        console.log('External check-in found:', checkInData);

        if (checkInData.dev_serial === '0010012') {
          console.log('Regular check-in detected');
        } else if (checkInData.dev_serial === '0010000') {
          console.log('Fallback check-in detected');
        }

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
        console.log(
          'No check-in found within shift time range. Performing wider search...',
        );
        const widerResult = await query<ExternalCheckInData[]>(
          `SELECT * FROM kt_jl 
           WHERE user_serial = ? 
           AND sj > ?
           AND dev_serial IN ('0010012', '0010000')
           ORDER BY sj DESC 
           LIMIT 1`,
          [
            normalizedEmployeeId,
            new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          ], // Look back 7 days
        );
        console.log('Wider search results:', widerResult);
        if (widerResult.length > 0) {
          return widerResult[0];
        }
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
    const sqlQuery =
      'INSERT INTO kt_jl (user_serial, sj, fx, dev_serial) VALUES (?, ?, ?, ?)';
    const params = [
      data.employeeId,
      data.timestamp,
      data.checkType,
      data.deviceSerial,
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
      'UPDATE kt_jl SET fx = ?, sj = ? WHERE user_serial = ? AND dev_serial = ? AND fx = 0 ORDER BY sj DESC LIMIT 1';
    const params = [
      data.checkType,
      data.timestamp,
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
      'INSERT INTO kt_jl (user_serial, sj, fx, dev_serial) VALUES (?, ?, ?, ?), (?, ?, ?, ?)';
    const params = [
      data.employeeId,
      data.checkInTimestamp,
      0, // Assuming 0 is for check-in
      data.deviceSerial,
      data.employeeId,
      data.checkOutTimestamp || data.checkInTimestamp,
      1, // Assuming 1 is for check-out
      data.deviceSerial,
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

    try {
      // Query 1: Get all columns and a sample of data
      const sampleData = await query<any[]>('SELECT * FROM kt_jl LIMIT 10');
      console.log('Sample data from kt_jl table:');
      console.log(JSON.stringify(sampleData, null, 2));

      // Query 2: Get data for specific users
      const specificUserData = await query<any[]>(
        "SELECT * FROM kt_jl WHERE user_serial IN ('1001', '100271') ORDER BY sj DESC LIMIT 20",
      );
      console.log('Data for users 1001 and 100271:');
      console.log(JSON.stringify(specificUserData, null, 2));

      // Query 3: Get table structure (this might not work depending on the database system and permissions)
      try {
        const tableStructure = await query<any[]>('DESCRIBE kt_jl');
        console.log('Structure of kt_jl table:');
        console.log(JSON.stringify(tableStructure, null, 2));
      } catch (error) {
        console.log(
          'Unable to fetch table structure. This might require additional permissions.',
        );
      }
    } catch (error) {
      console.error('Error running diagnostic queries:', error);
    }
  }
}

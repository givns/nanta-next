// services/attendanceApiService.ts

import {
  DailyAttendanceResponse,
  ManualEntryRequest,
  ManualEntryResponse,
  DepartmentInfo,
} from '@/types/attendance';

export class AttendanceApiService {
  private static baseUrl = '/api/admin/attendance';

  static async getDailyAttendance(
    lineUserId: string,
    date: Date,
    department?: string,
    searchTerm?: string,
  ): Promise<DailyAttendanceResponse[]> {
    try {
      const queryParams = new URLSearchParams({
        date: date.toISOString(),
        ...(department && department !== 'all' && { department }),
        ...(searchTerm && { searchTerm }),
      });

      const response = await fetch(`${this.baseUrl}/daily?${queryParams}`, {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch attendance records');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching daily attendance:', error);
      throw error;
    }
  }

  static async createManualEntry(
    lineUserId: string,
    entryData: ManualEntryRequest,
  ): Promise<ManualEntryResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/manual-entry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId,
        },
        body: JSON.stringify(entryData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create manual entry');
      }

      return await response.json();
    } catch (error) {
      console.error('Error creating manual entry:', error);
      throw error;
    }
  }

  static async getDepartments(lineUserId: string): Promise<DepartmentInfo[]> {
    try {
      const response = await fetch('/api/departments', {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch departments');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching departments:', error);
      throw error;
    }
  }
}

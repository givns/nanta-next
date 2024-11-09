// services/attendanceApiService.ts

import {
  DailyAttendanceResponse,
  ManualEntryRequest,
  ManualEntryResponse,
  DepartmentInfo,
} from '@/types/attendance';
import { format, isValid, parseISO, startOfDay } from 'date-fns';

export class AttendanceApiService {
  private static baseUrl = '/api/admin/attendance';

  private static formatDateForApi(date: Date | string): string {
    try {
      const validDate = date instanceof Date ? date : parseISO(date);
      if (!isValid(validDate)) {
        return format(new Date(), 'yyyy-MM-dd');
      }
      return format(startOfDay(validDate), 'yyyy-MM-dd');
    } catch (error) {
      console.warn('Error formatting date for API:', error);
      return format(new Date(), 'yyyy-MM-dd');
    }
  }

  static async getDailyAttendance(
    lineUserId: string,
    date: Date,
    department: string = 'all',
    searchTerm: string = '',
  ): Promise<DailyAttendanceResponse[]> {
    try {
      const queryParams = new URLSearchParams({
        date: this.formatDateForApi(date),
        department,
        ...(searchTerm && { searchTerm }),
      });

      const response = await fetch(`${this.baseUrl}/daily?${queryParams}`, {
        headers: {
          'x-line-userid': lineUserId,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to fetch attendance records');
      }

      const data: DailyAttendanceResponse[] = await response.json();
      return data;
    } catch (error) {
      console.error('Error in getDailyAttendance:', error);
      throw error instanceof Error
        ? error
        : new Error('Failed to fetch attendance records');
    }
  }

  static async createManualEntry(
    lineUserId: string,
    entryData: ManualEntryRequest,
  ): Promise<ManualEntryResponse> {
    try {
      console.log('Sending manual entry request:', entryData);

      const response = await fetch(`${this.baseUrl}/manual-entry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId,
        },
        body: JSON.stringify(entryData),
      });

      const responseData = await response.json();
      console.log('Manual entry response:', responseData);

      if (!response.ok) {
        throw new Error(
          responseData.message ||
            responseData.error ||
            'Failed to create manual entry',
        );
      }

      return {
        success: responseData.success || false,
        message: responseData.message || 'Attendance updated successfully',
        attendance: responseData.data || null,
      };
    } catch (error) {
      console.error('Error creating manual entry:', error);
      throw new Error(
        error instanceof Error
          ? error.message
          : 'Failed to create manual entry',
      );
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

// hooks/useAttendance.ts

import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from './useDebounce';
import { AttendanceApiService } from '@/services/attendanceApiService';
import {
  DailyAttendanceResponse,
  DepartmentInfo,
  ManualEntryRequest,
  AttendanceFilters,
  UseAttendanceProps,
} from '@/types/attendance';

interface UseAttendanceReturn {
  records: DailyAttendanceResponse[];
  filteredRecords: DailyAttendanceResponse[];
  departments: DepartmentInfo[];
  isLoading: boolean;
  error: string | null;
  filters: AttendanceFilters;
  setFilters: (filters: Partial<AttendanceFilters>) => void;
  createManualEntry: (data: ManualEntryRequest) => Promise<void>;
  refreshData: () => Promise<void>;
}

export function useAttendance({
  lineUserId,
}: UseAttendanceProps): UseAttendanceReturn {
  const [records, setRecords] = useState<DailyAttendanceResponse[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AttendanceFilters>({
    date: new Date(),
    department: 'all',
    searchTerm: '',
  });

  const debouncedSearch = useDebounce(filters.searchTerm, 300);

  // Fetch departments on mount
  useEffect(() => {
    if (lineUserId) {
      fetchDepartments();
    }
  }, [lineUserId]);

  // Fetch attendance data when filters change
  useEffect(() => {
    if (lineUserId) {
      fetchAttendanceRecords();
    }
  }, [lineUserId, filters, filters.date, filters.department, debouncedSearch]);

  async function fetchDepartments() {
    try {
      const data = await AttendanceApiService.getDepartments(lineUserId!);
      setDepartments(data);
    } catch (error) {
      setError('Failed to load departments');
      console.error('Error:', error);
    }
  }

  async function fetchAttendanceRecords() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await AttendanceApiService.getDailyAttendance(
        lineUserId!,
        filters.date,
        filters.department,
        debouncedSearch,
      );
      setRecords(data);
    } catch (error) {
      setError('Failed to load attendance records');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function createManualEntry(entryData: ManualEntryRequest) {
    try {
      setIsLoading(true);
      setError(null);
      await AttendanceApiService.createManualEntry(lineUserId!, entryData);
      await fetchAttendanceRecords();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to create manual entry',
      );
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  // Memoized filtered records
  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const matchesSearch =
        !debouncedSearch ||
        record.employeeName
          .toLowerCase()
          .includes(debouncedSearch.toLowerCase()) ||
        record.employeeId.toLowerCase().includes(debouncedSearch.toLowerCase());

      const matchesDepartment =
        filters.department === 'all' ||
        record.departmentName === filters.department;

      return matchesSearch && matchesDepartment;
    });
  }, [records, debouncedSearch, filters.department]);

  const updateFilters = (newFilters: Partial<AttendanceFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  return {
    records,
    filteredRecords,
    departments,
    isLoading,
    error,
    filters,
    setFilters: updateFilters,
    createManualEntry,
    refreshData: fetchAttendanceRecords,
  };
}

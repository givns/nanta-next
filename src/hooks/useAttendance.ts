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
import { startOfDay, isValid } from 'date-fns';

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
  initialDate = new Date(),
  initialDepartment = 'all',
  initialSearchTerm = '',
}: UseAttendanceProps): UseAttendanceReturn {
  const [records, setRecords] = useState<DailyAttendanceResponse[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AttendanceFilters>({
    date: startOfDay(isValid(initialDate) ? initialDate : new Date()),
    department: initialDepartment,
    searchTerm: initialSearchTerm,
  });

  const debouncedSearch = useDebounce(filters.searchTerm, 300);

  // Fetch attendance data
  const fetchAttendanceRecords = async () => {
    if (!lineUserId) return;

    try {
      setIsLoading(true);
      setError(null);
      const data = await AttendanceApiService.getDailyAttendance(
        lineUserId,
        filters.date,
        filters.department,
        debouncedSearch,
      );
      setRecords(data);
    } catch (error) {
      console.error('Error fetching attendance:', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to load attendance records',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Handle filter updates
  const updateFilters = (newFilters: Partial<AttendanceFilters>) => {
    setFilters((prev) => {
      const updated = { ...prev, ...newFilters };

      // Ensure date is always valid
      if ('date' in newFilters) {
        updated.date = startOfDay(
          isValid(newFilters.date) ? newFilters.date! : new Date(),
        );
      }

      return updated;
    });
  };

  // Fetch departments on mount
  useEffect(() => {
    if (lineUserId) {
      AttendanceApiService.getDepartments(lineUserId)
        .then(setDepartments)
        .catch((error) => {
          console.error('Error fetching departments:', error);
          setError('Failed to load departments');
        });
    }
  }, [lineUserId]);

  // Fetch attendance when filters change
  useEffect(() => {
    if (lineUserId) {
      fetchAttendanceRecords();
    }
  }, [lineUserId, filters.date, filters.department, debouncedSearch]);

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

  const createManualEntry = async (entryData: ManualEntryRequest) => {
    if (!lineUserId) return;

    try {
      setIsLoading(true);
      setError(null);
      await AttendanceApiService.createManualEntry(lineUserId, entryData);
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

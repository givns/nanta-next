import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from './useDebounce';
import { AttendanceApiService } from '@/services/attendanceApiService';
import {
  DailyAttendanceResponse,
  DepartmentInfo,
  ManualEntryRequest,
  AttendanceFilters,
} from '@/types/attendance';
import { startOfDay, isValid, parseISO, format } from 'date-fns';

export interface UseAttendanceProps {
  lineUserId: string | null;
  initialDate?: Date | string;
  initialDepartment?: string;
  initialSearchTerm?: string;
  enabled?: boolean; // Add enabled prop
}

export interface UseAttendanceReturn {
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
  enabled = true,
}: UseAttendanceProps): UseAttendanceReturn {
  const [records, setRecords] = useState<DailyAttendanceResponse[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getValidDate = (date: Date | string): Date => {
    try {
      const parsedDate = typeof date === 'string' ? parseISO(date) : date;
      return isValid(parsedDate)
        ? startOfDay(parsedDate)
        : startOfDay(new Date());
    } catch {
      return startOfDay(new Date());
    }
  };

  const [filters, setFilters] = useState<AttendanceFilters>({
    date: getValidDate(initialDate),
    department: initialDepartment,
    searchTerm: initialSearchTerm,
  });

  const debouncedSearch = useDebounce(filters.searchTerm, 300);

  const updateFilters = (newFilters: Partial<AttendanceFilters>) => {
    setFilters((prev) => {
      const updated = { ...prev };

      if ('date' in newFilters && newFilters.date) {
        updated.date = getValidDate(newFilters.date);
      }
      if ('department' in newFilters && newFilters.department) {
        updated.department = newFilters.department;
      }
      if ('searchTerm' in newFilters) {
        updated.searchTerm = newFilters.searchTerm ?? '';
      }

      return updated;
    });
  };

  const fetchAttendanceRecords = async () => {
    if (!lineUserId || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      // Validate and format date
      const validDate = getValidDate(filters.date);
      const dateStr = format(validDate, 'yyyy-MM-dd');

      const data = await AttendanceApiService.getDailyAttendance(
        lineUserId,
        validDate,
        filters.department,
        debouncedSearch,
      );

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from server');
      }

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

  // Fetch departments on mount if enabled
  useEffect(() => {
    if (lineUserId && enabled) {
      AttendanceApiService.getDepartments(lineUserId)
        .then((data) => {
          if (Array.isArray(data)) {
            setDepartments(data);
          } else {
            throw new Error('Invalid departments data format');
          }
        })
        .catch((error) => {
          console.error('Error fetching departments:', error);
          setError('Failed to load departments');
        });
    }
  }, [lineUserId, enabled]);

  // Fetch attendance when filters change and enabled
  useEffect(() => {
    if (lineUserId && enabled) {
      fetchAttendanceRecords();
    }
  }, [lineUserId, enabled, filters.date, filters.department, debouncedSearch]);

  // Memoized filtered records with type safety
  const filteredRecords = useMemo(() => {
    if (!Array.isArray(records)) return [];

    return records.filter((record) => {
      if (!record) return false;

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
    if (!lineUserId || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);
      await AttendanceApiService.createManualEntry(lineUserId, entryData);
      await fetchAttendanceRecords();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to create manual entry';
      setError(errorMessage);
      throw new Error(errorMessage);
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

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import { AttendanceApiService } from '@/services/attendanceApiService';
import { startOfDay, isValid, parseISO, format, endOfDay } from 'date-fns';
import { validateAttendanceRecord } from '@/utils/timeUtils';
import { DepartmentInfo } from '@/types/attendance/department';
import { AttendanceFilters, DateRange } from '@/types/attendance/utils';
import { ManualEntryRequest } from '@/types/attendance/manual';
import {
  DailyAttendanceRecord,
  PeriodType,
  UseDailyAttendanceProps,
  UseDailyAttendanceReturn,
} from '@/types/attendance';
import { AttendanceState } from '@prisma/client';

export function useDailyAttendance({
  lineUserId,
  initialDate = new Date(),
  initialDepartment = 'all',
  initialSearchTerm = '',
  enabled = true,
}: UseDailyAttendanceProps): UseDailyAttendanceReturn {
  // State declarations
  const [records, setRecords] = useState<DailyAttendanceRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize filters with proper types
  const [filters, setFilters] = useState<AttendanceFilters>(() => ({
    dateRange: {
      start: startOfDay(initialDate),
      end: endOfDay(initialDate),
      isValid: true,
      duration: 1,
    },
    departments: initialDepartment === 'all' ? undefined : [initialDepartment],
    currentState: AttendanceState.PRESENT,
    periodTypes: [PeriodType.REGULAR],
    searchTerm: initialSearchTerm || undefined,
  }));

  const debouncedSearch = useDebounce(filters.searchTerm || '', 300);

  // Memoize date validation function
  const getValidDateRange = useCallback((date: Date | string): DateRange => {
    try {
      const validDate = typeof date === 'string' ? parseISO(date) : date;
      if (!isValid(validDate)) {
        throw new Error('Invalid date');
      }
      return {
        start: startOfDay(validDate),
        end: endOfDay(validDate),
        isValid: true,
        duration: 1,
      };
    } catch {
      const now = new Date();
      return {
        start: startOfDay(now),
        end: endOfDay(now),
        isValid: true,
        duration: 1,
      };
    }
  }, []);

  // Update filter update function
  const updateFilters = useCallback(
    (newFilters: Partial<AttendanceFilters>) => {
      setFilters((prev) => ({
        ...prev,
        ...newFilters,
        // Ensure dateRange is properly formatted if provided
        ...(newFilters.dateRange && {
          dateRange: {
            ...newFilters.dateRange,
            isValid: true,
            duration: 1,
          },
        }),
      }));
    },
    [],
  );

  const fetchAttendanceRecords = useCallback(async () => {
    if (!lineUserId || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      const dateStr = format(filters.dateRange.start, 'yyyy-MM-dd');

      const data = await AttendanceApiService.getDailyAttendance(
        lineUserId,
        filters.dateRange.start,
        filters.departments?.[0] || 'all',
        debouncedSearch,
      );

      if (!Array.isArray(data)) {
        throw new Error('Invalid response format from server');
      }

      const validatedRecords = data
        .map(validateAttendanceRecord)
        .filter((record): record is DailyAttendanceRecord => record !== null)
        // Apply state filter
        .filter(
          (record) =>
            !filters.currentState || record.state === filters.currentState,
        );

      setRecords(validatedRecords);
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
  }, [
    lineUserId,
    enabled,
    filters.dateRange,
    filters.departments,
    filters.currentState,
    debouncedSearch,
  ]);

  // Fetch departments on mount if enabled
  useEffect(() => {
    let isMounted = true;

    if (lineUserId && enabled) {
      AttendanceApiService.getDepartments(lineUserId)
        .then((data) => {
          if (!isMounted) return;

          if (Array.isArray(data)) {
            setDepartments(data);
          } else {
            throw new Error('Invalid departments data format');
          }
        })
        .catch((error) => {
          if (!isMounted) return;

          console.error('Error fetching departments:', error);
          setError('Failed to load departments');
        });
    }

    return () => {
      isMounted = false;
    };
  }, [lineUserId, enabled]);

  // Fetch attendance when filters change and enabled
  useEffect(() => {
    if (lineUserId && enabled) {
      fetchAttendanceRecords();
    }
  }, [fetchAttendanceRecords, lineUserId, enabled]);

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
        !filters.departments?.length ||
        filters.departments.includes(record.departmentName);

      const matchesState =
        !filters.currentState || record.state === filters.currentState;

      return matchesSearch && matchesDepartment && matchesState;
    });
  }, [records, debouncedSearch, filters.departments, filters.currentState]);

  // Memoize createManualEntry function
  const createManualEntry = useCallback(
    async (entryData: ManualEntryRequest) => {
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
    },
    [lineUserId, enabled, fetchAttendanceRecords],
  );

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

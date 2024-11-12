import { useState, useEffect, useMemo, useCallback } from 'react';
import { useDebounce } from './useDebounce';
import { AttendanceApiService } from '@/services/attendanceApiService';
import {
  DailyAttendanceResponse,
  DepartmentInfo,
  ManualEntryRequest,
  AttendanceFilters,
  UseAttendanceProps,
} from '@/types/attendance';
import { startOfDay, isValid, parseISO, format } from 'date-fns';
import { validateAttendanceTime, validateShiftInfo } from '@/utils/timeUtils';

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
  // State declarations
  const [records, setRecords] = useState<DailyAttendanceResponse[]>([]);
  const [departments, setDepartments] = useState<DepartmentInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize date validation function
  const getValidDate = useCallback((date: Date | string): Date => {
    try {
      const parsedDate = typeof date === 'string' ? parseISO(date) : date;
      return isValid(parsedDate)
        ? startOfDay(parsedDate)
        : startOfDay(new Date());
    } catch {
      return startOfDay(new Date());
    }
  }, []);

  // Initialize filters with memoized valid date
  const [filters, setFilters] = useState<AttendanceFilters>(() => ({
    date: getValidDate(initialDate),
    department: initialDepartment,
    searchTerm: initialSearchTerm,
  }));

  const debouncedSearch = useDebounce(filters.searchTerm, 300);

  // Memoize filter update function
  const updateFilters = useCallback(
    (newFilters: Partial<AttendanceFilters>) => {
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
    },
    [getValidDate],
  );

  // Memoize record validation function
  const validateAttendanceRecord = useCallback(
    (record: any): DailyAttendanceResponse | null => {
      if (!record) return null;

      try {
        const validatedRecord: DailyAttendanceResponse = {
          employeeId: record.employeeId || '',
          employeeName: record.employeeName || '',
          departmentName: record.departmentName || '',
          date: record.date || format(new Date(), 'yyyy-MM-dd'),
          shift: validateShiftInfo(record.shift),
          attendance: validateAttendanceTime(record.attendance),
          isDayOff: !!record.isDayOff,
          leaveInfo: record.leaveInfo
            ? {
                type: record.leaveInfo.type || '',
                status: record.leaveInfo.status || '',
              }
            : null,
        };

        // Additional validation for required fields
        if (!validatedRecord.employeeId || !validatedRecord.employeeName) {
          return null;
        }

        return validatedRecord;
      } catch (error) {
        console.error('Error validating attendance record:', error, record);
        return null;
      }
    },
    [],
  );

  // Memoize fetch function
  const fetchAttendanceRecords = useCallback(async () => {
    if (!lineUserId || !enabled) return;

    try {
      setIsLoading(true);
      setError(null);

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

      // Validate and filter records in one pass
      const validatedRecords = data
        .map(validateAttendanceRecord)
        .filter((record): record is DailyAttendanceResponse => record !== null);

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
    filters.date,
    filters.department,
    debouncedSearch,
    getValidDate,
    validateAttendanceRecord,
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
        filters.department === 'all' ||
        record.departmentName === filters.department;

      return matchesSearch && matchesDepartment;
    });
  }, [records, debouncedSearch, filters.department]);

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

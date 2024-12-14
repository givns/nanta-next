import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DailyAttendanceRecord,
  DateRange,
  AttendanceState,
  PeriodType,
} from '@/types/attendance';
import { useDailyAttendance } from '@/hooks/useDailyAttendance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateSelector } from './components/DateSelector';
import { SearchFilters } from './components/SearchFilters';
import { SummaryStats } from './components/SummaryStats';
import { DesktopView } from './components/DesktopView';
import { MobileView } from './components/MobileView';
import { LoadingState } from './components/LoadingState';
import { ErrorAlert } from './components/ErrorAlert';
import { EmployeeDetailDialog } from './EmployeeDetailDialog';
import { format, isValid, startOfDay, parseISO } from 'date-fns';
import { useRouter } from 'next/router';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ErrorBoundary } from 'react-error-boundary';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

// Add summary interface
interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  onLeave: number;
  dayOff: number;
}

function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="p-4">
      <Alert variant="destructive">
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          {error.message}
          <button onClick={resetErrorBoundary} className="ml-2 underline">
            Try again
          </button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ensureValidDate(date: Date | string | null | undefined): Date {
  if (!date) {
    return startOfDay(new Date());
  }

  try {
    const parsedDate = typeof date === 'string' ? parseISO(date) : date;
    return isValid(parsedDate)
      ? startOfDay(parsedDate)
      : startOfDay(new Date());
  } catch (error) {
    console.error('Error parsing date:', error);
    return startOfDay(new Date());
  }
}

export default function DailyAttendanceView() {
  const router = useRouter();
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });
  const { lineUserId } = useLiff();

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceRecord | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Add summary state
  const [summary, setSummary] = useState<AttendanceSummary>({
    total: 0,
    present: 0,
    absent: 0,
    onLeave: 0,
    dayOff: 0,
  });

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (!router.isReady) return startOfDay(new Date());
    const { date } = router.query;
    return ensureValidDate(typeof date === 'string' ? date : null);
  });

  useEffect(() => {
    if (router.isReady && !isInitialized) {
      const { date } = router.query;
      setSelectedDate(ensureValidDate(typeof date === 'string' ? date : null));
      setIsInitialized(true);
    }
  }, [router.isReady, isInitialized]);

  const shouldFetchData = useMemo(() => {
    return (
      !authLoading && isInitialized && !!lineUserId && isValid(selectedDate)
    );
  }, [authLoading, isInitialized, lineUserId, selectedDate]);

  const {
    records,
    filteredRecords,
    departments,
    isLoading: isDataLoading,
    error,
    filters,
    setFilters,
    refreshData,
  } = useDailyAttendance({
    lineUserId,
    initialDate: selectedDate,
    initialDepartment: 'all',
    initialSearchTerm: '',
    enabled: shouldFetchData,
  });

  // Calculate summary when records change
  useEffect(() => {
    if (Array.isArray(filteredRecords)) {
      setSummary({
        total: filteredRecords.length,
        present: filteredRecords.filter((r) => r?.CheckInTime).length,
        absent: filteredRecords.filter(
          (r) => !r?.CheckInTime && !r?.leaveInfo && !r?.isDayOff,
        ).length,
        onLeave: filteredRecords.filter((r) => r?.leaveInfo).length,
        dayOff: filteredRecords.filter((r) => r?.isDayOff).length,
      });
    }
  }, [filteredRecords]);

  const processedRecords = useMemo(() => {
    if (!Array.isArray(records)) return [];

    try {
      return [...records].sort((a, b) => {
        const getStatusPriority = (record: DailyAttendanceRecord): number => {
          if (!record) return -1;
          if (record.leaveInfo) return 1;
          if (record.isDayOff) return 2;
          if (!record.CheckInTime) return 0;
          return 3;
        };

        const priorityA = getStatusPriority(a);
        const priorityB = getStatusPriority(b);

        if (priorityA !== priorityB) return priorityA - priorityB;
        return (a.departmentName || '').localeCompare(b.departmentName || '');
      });
    } catch (error) {
      console.error('Error processing records:', error);
      return [];
    }
  }, [records]);

  const handleDateChange = useCallback(
    (newDate: Date | undefined) => {
      if (!newDate || !isValid(newDate)) {
        console.warn('Invalid date selected:', newDate);
        return;
      }

      const processedDate = startOfDay(newDate);
      const formattedDate = format(processedDate, 'yyyy-MM-dd');

      try {
        router.push(
          {
            pathname: router.pathname,
            query: { ...router.query, date: formattedDate },
          },
          undefined,
          { shallow: true },
        );

        setSelectedDate(processedDate);

        const dateRange: DateRange = {
          start: processedDate,
          end: processedDate,
          isValid: true,
          duration: 1,
        };

        setFilters({
          dateRange,
          currentState: AttendanceState.ABSENT,
        });
      } catch (error) {
        console.error('Error updating date:', error);
      }
    },
    [router, setFilters],
  );

  const handleRecordSelect = useCallback(
    (record: DailyAttendanceRecord) => {
      if (!record || !selectedDate) return;
      setSelectedEmployee(record.employeeId);
      setShowEmployeeDetail(true);
    },
    [selectedDate],
  );

  const handleEditRecord = useCallback(
    (e: React.MouseEvent, record: DailyAttendanceRecord) => {
      e.stopPropagation();
      setSelectedRecord(record);
      setShowEmployeeDetail(true);
    },
    [],
  );

  if (authLoading || !isInitialized) {
    return <LoadingState />;
  }

  if (!isAuthorized || !lineUserId) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            คุณไม่มีสิทธิ์ในการเข้าถึงส่วนนี้ กรุณาติดต่อผู้ดูแลระบบ
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        refreshData();
      }}
    >
      <div className="space-y-4">
        <div className="md:hidden">
          <SummaryStats summary={summary} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle>Daily Attendance</CardTitle>
              <DateSelector
                date={selectedDate}
                onChange={handleDateChange}
                fromYear={2024}
                toYear={new Date().getFullYear()}
                disableFutureDates={true}
                className="w-[260px]"
              />
            </div>
          </CardHeader>

          <CardContent>
            <div className="space-y-6">
              <SearchFilters
                filters={{
                  searchTerm: filters.searchTerm || '',
                  department: filters.departments?.[0] || 'all', // Convert first department to string
                }}
                departments={departments}
                onSearchChange={(term) =>
                  setFilters({ ...filters, searchTerm: term })
                }
                onDepartmentChange={(dept) =>
                  setFilters({
                    ...filters,
                    departments: dept === 'all' ? [] : [dept],
                  })
                }
              />

              <div className="hidden md:block">
                <SummaryStats summary={summary} />
              </div>

              {isDataLoading ? (
                <LoadingState />
              ) : error ? (
                <ErrorAlert error={error} onRetry={refreshData} />
              ) : (
                <>
                  <div className="hidden md:block">
                    <DesktopView
                      records={processedRecords}
                      onRecordSelect={handleRecordSelect}
                      onEditRecord={handleEditRecord}
                    />
                  </div>
                  <div className="md:hidden">
                    <MobileView
                      records={processedRecords}
                      onRecordSelect={handleRecordSelect}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {selectedEmployee && selectedDate && (
          <EmployeeDetailDialog
            open={showEmployeeDetail}
            onOpenChange={setShowEmployeeDetail}
            employeeId={selectedEmployee}
            date={selectedDate}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

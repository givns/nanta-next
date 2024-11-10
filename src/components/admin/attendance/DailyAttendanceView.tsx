// components/admin/attendance/DailyAttendanceView.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { DailyAttendanceResponse } from '@/types/attendance';
import { useAttendance } from '@/hooks/useAttendance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateSelector } from './components/DateSelector';
import { SearchFilters } from './components/SearchFilters';
import { SummaryStats } from './components/SummaryStats';
import { DesktopView } from './components/DesktopView';
import { MobileView } from './components/MobileView';
import { LoadingState } from './components/LoadingState';
import { ErrorAlert } from './components/ErrorAlert';
import { EmployeeDetailDialog } from './EmployeeDetailDialog';
import { format, isValid, startOfDay, parse } from 'date-fns';
import { useRouter } from 'next/router';

export default function DailyAttendanceView() {
  const router = useRouter();
  const { user, isLoading: isAdminLoading } = useAdmin();
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceResponse | null>(null);

  // Initialize date from query params or current date
  useEffect(() => {
    if (router.isReady) {
      const { date } = router.query;
      let initialDate: Date;

      if (date && typeof date === 'string') {
        try {
          initialDate = parse(date, 'yyyy-MM-dd', new Date());
          if (!isValid(initialDate)) throw new Error('Invalid date');
        } catch {
          initialDate = startOfDay(new Date());
        }
      } else {
        initialDate = startOfDay(new Date());
      }

      setSelectedDate(initialDate);
      setIsInitialized(true);
    }
  }, [router.isReady, router.query]);

  // Only initialize after we have both user and date
  const shouldInitialize = useMemo(() => {
    return (
      !isAdminLoading && isInitialized && !!user?.lineUserId && !!selectedDate
    );
  }, [isAdminLoading, isInitialized, user?.lineUserId, selectedDate]);

  const {
    records,
    filteredRecords,
    departments,
    isLoading: isDataLoading,
    error,
    filters,
    setFilters,
    refreshData,
  } = useAttendance({
    lineUserId: user?.lineUserId || null,
    initialDate: selectedDate || new Date(),
    initialDepartment: 'all',
    initialSearchTerm: '',
  });

  // Processed records with proper error handling
  const processedRecords = useMemo(() => {
    if (!records?.length) return [];

    try {
      return [...records].sort((a, b) => {
        const getStatusPriority = (record: DailyAttendanceResponse): number => {
          if (!record) return -1;
          if (record.leaveInfo) return 1;
          if (record.isDayOff) return 2;
          if (!record.attendance?.regularCheckInTime) return 0;
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

  // Handle date changes with URL sync
  const handleDateChange = (newDate: Date | undefined) => {
    if (newDate && isValid(newDate)) {
      const formattedDate = format(newDate, 'yyyy-MM-dd');
      router.push(
        {
          pathname: router.pathname,
          query: { ...router.query, date: formattedDate },
        },
        undefined,
        { shallow: true },
      );
      setSelectedDate(newDate);
      setFilters({ date: newDate });
    }
  };

  const handleRecordSelect = (record: DailyAttendanceResponse) => {
    if (!record || !selectedDate) return;
    setSelectedEmployee(record.employeeId);
    setShowEmployeeDetail(true);
  };

  const handleEditRecord = (
    e: React.MouseEvent,
    record: DailyAttendanceResponse,
  ) => {
    e.stopPropagation();
    setSelectedRecord(record);
    setShowEditDialog(true);
  };

  // Show loading state if any critical dependency is loading
  if (isAdminLoading || !isInitialized || !selectedDate) {
    return <LoadingState />;
  }

  const summary = useMemo(
    () => ({
      total: filteredRecords.length,
      present: filteredRecords.filter((r) => r?.attendance?.regularCheckInTime)
        .length,
      absent: filteredRecords.filter(
        (r) =>
          !r?.attendance?.regularCheckInTime && !r?.leaveInfo && !r?.isDayOff,
      ).length,
      onLeave: filteredRecords.filter((r) => r?.leaveInfo).length,
      dayOff: filteredRecords.filter((r) => r?.isDayOff).length,
    }),
    [filteredRecords],
  );

  return (
    <div className="space-y-4">
      {/* Mobile Summary */}
      <div className="md:hidden">
        <SummaryStats summary={summary} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Daily Attendance</CardTitle>
            <DateSelector date={selectedDate} onChange={handleDateChange} />
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-6">
            <SearchFilters
              filters={filters}
              departments={departments}
              onSearchChange={(term) => setFilters({ searchTerm: term })}
              onDepartmentChange={(dept) => setFilters({ department: dept })}
            />

            <SummaryStats
              summary={useMemo(
                () => ({
                  total: filteredRecords.length,
                  present: filteredRecords.filter(
                    (r) => r?.attendance?.regularCheckInTime,
                  ).length,
                  absent: filteredRecords.filter(
                    (r) =>
                      !r?.attendance?.regularCheckInTime &&
                      !r?.leaveInfo &&
                      !r?.isDayOff,
                  ).length,
                  onLeave: filteredRecords.filter((r) => r?.leaveInfo).length,
                  dayOff: filteredRecords.filter((r) => r?.isDayOff).length,
                }),
                [filteredRecords],
              )}
            />

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
  );
}

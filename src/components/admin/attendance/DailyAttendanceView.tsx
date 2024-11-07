// components/admin/attendance/DailyAttendanceView.tsx

import React, { useState, useMemo } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { DailyAttendanceResponse } from '@/types/attendance';
import { useAttendance } from '@/hooks/useAttendance';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmployeeDetailDialog } from './EmployeeDetailDialog';

import { DateSelector } from './components/DateSelector';
import { SearchFilters } from './components/SearchFilters';
import { SummaryStats } from './components/SummaryStats';
import { DesktopView } from './components/DesktopView';
import { MobileView } from './components/MobileView';
import { LoadingState } from './components/LoadingState';
import { ErrorAlert } from './components/ErrorAlert';
import { startOfDay } from 'date-fns';

export default function DailyAttendanceView() {
  const { user } = useAdmin();
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceResponse | null>(null);

  const date = startOfDay(new Date());

  const {
    records,
    filteredRecords,
    departments,
    isLoading,
    error,
    filters,
    setFilters,
    refreshData,
  } = useAttendance({
    lineUserId: user?.lineUserId || null,
    date,
  });

  // Memoized Calculations with null checks
  const processedRecords = useMemo(() => {
    return records
      .filter((record) => record && record.departmentName) // Add null checks
      .sort((a, b) => {
        const getStatusPriority = (record: DailyAttendanceResponse) => {
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
  }, [records]);

  // Enhanced summary calculation with null checks
  const summary = useMemo(
    () => ({
      total: filteredRecords.length,
      present: filteredRecords.filter(
        (r) => r && r.attendance?.regularCheckInTime,
      ).length,
      absent: filteredRecords.filter(
        (r) =>
          r && !r.attendance?.regularCheckInTime && !r.leaveInfo && !r.isDayOff,
      ).length,
      onLeave: filteredRecords.filter((r) => r && r.leaveInfo).length,
      dayOff: filteredRecords.filter((r) => r && r.isDayOff).length,
    }),
    [filteredRecords],
  );

  // Event Handlers with date normalization
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      const normalizedDate = startOfDay(date);
      setFilters({ date: normalizedDate });
    }
  };

  const handleRecordSelect = (record: DailyAttendanceResponse) => {
    if (!record) return;
    setSelectedEmployee(record.employeeId);
    setShowEmployeeDetail(true);
  };

  const handleEditRecord = (
    e: React.MouseEvent,
    record: DailyAttendanceResponse,
  ) => {
    if (!record) return;
    e.stopPropagation();
    setSelectedRecord(record);
    setShowEditDialog(true);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Daily Attendance</CardTitle>
            <DateSelector
              date={filters.date || date}
              onChange={handleDateChange}
            />
          </div>
        </CardHeader>

        <CardContent>
          <SearchFilters
            filters={filters}
            departments={departments}
            onSearchChange={(term) => setFilters({ searchTerm: term })}
            onDepartmentChange={(dept) => setFilters({ department: dept })}
          />

          <SummaryStats summary={summary} />

          {isLoading && <LoadingState />}
          {error && <ErrorAlert error={error} />}

          {!isLoading && !error && (
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
        </CardContent>
      </Card>

      {selectedEmployee && (
        <EmployeeDetailDialog
          open={showEmployeeDetail}
          onOpenChange={setShowEmployeeDetail}
          employeeId={selectedEmployee}
          date={filters.date || date}
        />
      )}
    </div>
  );
}

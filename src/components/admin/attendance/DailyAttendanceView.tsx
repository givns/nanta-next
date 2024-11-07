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

export default function DailyAttendanceView() {
  const { user } = useAdmin();
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceResponse | null>(null);

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
  });

  // Memoized Calculations
  const processedRecords = useMemo(() => {
    return records.sort((a, b) => {
      const getStatusPriority = (record: DailyAttendanceResponse) => {
        if (record.leaveInfo) return 1;
        if (record.isDayOff) return 2;
        if (!record.attendance?.regularCheckInTime) return 0;
        return 3;
      };

      const priorityA = getStatusPriority(a);
      const priorityB = getStatusPriority(b);
      return priorityA !== priorityB
        ? priorityA - priorityB
        : a.departmentName.localeCompare(b.departmentName);
    });
  }, [records]);

  const summary = useMemo(
    () => ({
      total: filteredRecords.length,
      present: filteredRecords.filter((r) => r.attendance?.regularCheckInTime)
        .length,
      absent: filteredRecords.filter(
        (r) => !r.attendance?.regularCheckInTime && !r.leaveInfo && !r.isDayOff,
      ).length,
      onLeave: filteredRecords.filter((r) => r.leaveInfo).length,
      dayOff: filteredRecords.filter((r) => r.isDayOff).length,
    }),
    [filteredRecords],
  );

  // Event Handlers
  const handleDateChange = (date: Date | undefined) => {
    if (date) setFilters({ date });
  };

  const handleRecordSelect = (record: DailyAttendanceResponse) => {
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Daily Attendance</CardTitle>
            {/* Date Selector */}
            <DateSelector date={filters.date} onChange={handleDateChange} />
          </div>
        </CardHeader>

        <CardContent>
          {/* Filters */}
          <SearchFilters
            filters={filters}
            departments={departments}
            onSearchChange={(term) => setFilters({ searchTerm: term })}
            onDepartmentChange={(dept) => setFilters({ department: dept })}
          />

          {/* Summary Stats */}
          <SummaryStats summary={summary} />

          {/* Loading & Error States */}
          {isLoading && <LoadingState />}
          {error && <ErrorAlert error={error} />}

          {/* Desktop View */}
          <DesktopView
            records={processedRecords}
            onRecordSelect={handleRecordSelect}
            onEditRecord={handleEditRecord}
          />

          {/* Mobile View */}
          <MobileView
            records={processedRecords}
            onRecordSelect={handleRecordSelect}
          />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <EmployeeDetailDialog
        open={showEmployeeDetail}
        onOpenChange={setShowEmployeeDetail}
        employeeId={selectedEmployee}
        date={filters.date}
      />
    </div>
  );
}

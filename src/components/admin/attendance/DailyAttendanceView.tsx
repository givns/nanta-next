import React, { useState, useMemo } from 'react';
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
import { format, isValid, startOfDay } from 'date-fns';
import { th } from 'date-fns/locale/th';

export default function DailyAttendanceView() {
  const { user } = useAdmin();
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceResponse | null>(null);
  const [selectedDate, setSelectedDate] = useState(() =>
    startOfDay(new Date()),
  );

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
    initialDate: new Date(), // This will be handled by getValidDate
    initialDepartment: 'all',
    initialSearchTerm: '',
  });

  // Memoized calculations for UI optimizations
  const processedRecords = useMemo(() => {
    if (!records?.length) return [];

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
  }, [records]);

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

  const handleDateChange = (newDate: Date | undefined) => {
    if (newDate) {
      setFilters({ date: newDate });
    }
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

  // If the admin context is still loading, return null to prevent double loading states
  const { isLoading: isAdminLoading } = useAdmin();
  if (isAdminLoading) return null;

  return (
    <div className="space-y-4">
      {/* Mobile Summary */}
      <div className="md:hidden">
        <SummaryStats summary={summary} />
      </div>

      <Card>
        <CardHeader className="space-y-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle>Daily Attendance</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                {format(filters.date, 'EEEE, d MMMM yyyy', { locale: th })}
              </p>
            </div>
            <div className="w-full sm:w-auto">
              <DateSelector date={filters.date} onChange={handleDateChange} />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="space-y-6">
            {/* Desktop Summary */}
            <div className="hidden md:block">
              <SummaryStats summary={summary} />
            </div>

            <SearchFilters
              filters={filters}
              departments={departments}
              onSearchChange={(term) => setFilters({ searchTerm: term })}
              onDepartmentChange={(dept) => setFilters({ department: dept })}
            />

            {isLoading ? (
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

      {selectedEmployee && (
        <EmployeeDetailDialog
          open={showEmployeeDetail}
          onOpenChange={setShowEmployeeDetail}
          employeeId={selectedEmployee}
          date={new Date(filters.date)}
        />
      )}
    </div>
  );
}

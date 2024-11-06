// components/admin/attendance/DailyAttendanceView.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useDebounce } from '@/hooks/useDebounce';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DailyAttendanceRecord,
  AttendanceFilters,
  DailyAttendanceResponse,
  ManualEntryRequest,
} from '@/types/attendance';
import { useAttendance } from '@/hooks/useAttendance';
import {
  Search,
  Calendar as CalendarIcon,
  Users,
  UserCheck,
  UserX,
  Loader2,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import { StatCard } from './StatCard';
import { AttendanceCard } from './AttendanceCard';
import { EmployeeDetailDialog } from './EmployeeDetailDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AttendanceApiService } from '@/services/attendanceApiService';

export default function DailyAttendanceView() {
  const { user } = useAdmin();
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    records,
    filteredRecords,
    departments,
    isLoading,
    error,
    filters,
    setFilters,
    createManualEntry,
    refreshData,
  } = useAttendance({
    lineUserId: user?.lineUserId || null,
  });

  const debouncedSearch = useDebounce(filters.searchTerm, 300);

  const handleManualEntry = async (formData: ManualEntryRequest) => {
    if (!selectedRecord || !user?.lineUserId) return;

    try {
      setIsSubmitting(true);
      setFormError(null);

      const response = await AttendanceApiService.createManualEntry(
        user.lineUserId,
        {
          employeeId: selectedRecord.employeeId,
          date: format(filters.date, 'yyyy-MM-dd'),
          checkInTime: formData.checkInTime,
          checkOutTime: formData.checkOutTime,
          reason: formData.reason,
        },
      );

      if (response.success) {
        setShowEditDialog(false);
        setSelectedRecord(null);
        await refreshData();
      } else {
        setFormError(response.message);
      }
    } catch (error) {
      console.error('Error submitting manual entry:', error);
      setFormError(
        error instanceof Error
          ? error.message
          : 'Failed to submit manual entry',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle filters
  const handleDateChange = (date: Date | undefined) => {
    if (date) {
      setFilters({ date });
    }
  };

  const handleDepartmentChange = (department: string) => {
    setFilters({ department });
  };

  const handleSearch = (searchTerm: string) => {
    setFilters({ searchTerm });
  };

  // Memoized filtered and sorted records
  const processedRecords = useMemo(() => {
    return records.sort((a, b) => {
      // Sort by status priority
      const getStatusPriority = (record: DailyAttendanceResponse) => {
        if (record.leaveInfo) return 1;
        if (record.isDayOff) return 2;
        if (!record.attendance?.regularCheckInTime) return 0;
        return 3;
      };

      const priorityA = getStatusPriority(a);
      const priorityB = getStatusPriority(b);

      if (priorityA !== priorityB) return priorityA - priorityB;

      // Then by department
      return a.departmentName.localeCompare(b.departmentName);
    });
  }, [records]);

  // Calculate summary statistics
  const summary = useMemo(
    () => ({
      total: records.length,
      present: records.filter((r) => r.attendance?.regularCheckInTime).length,
      absent: records.filter(
        (r) => !r.attendance?.regularCheckInTime && !r.leaveInfo && !r.isDayOff,
      ).length,
      onLeave: records.filter((r) => r.leaveInfo).length,
      dayOff: records.filter((r) => r.isDayOff).length,
    }),
    [records],
  );

  const getStatusBadge = (record: DailyAttendanceResponse) => {
    if (record.leaveInfo) {
      return <Badge variant="secondary">{`On ${record.leaveInfo.type}`}</Badge>;
    }
    if (record.isDayOff) {
      return <Badge variant="outline">Day Off</Badge>;
    }
    if (!record.attendance?.regularCheckInTime) {
      return <Badge variant="destructive">Absent</Badge>;
    }
    if (!record.attendance.regularCheckOutTime) {
      return <Badge variant="warning">Incomplete</Badge>;
    }
    if (record.attendance.isLateCheckIn || record.attendance.isLateCheckOut) {
      return <Badge variant="warning">Late</Badge>;
    }
    return <Badge variant="success">Present</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>Daily Attendance</CardTitle>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {format(filters.date, 'EEEE, d MMMM yyyy', { locale: th })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={filters.date}
                  onSelect={handleDateChange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardHeader>

        <CardContent>
          {/* Search and filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search employee..."
                className="pl-10"
                value={filters.searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <Select
              value={filters.department}
              onValueChange={handleDepartmentChange}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <StatCard
              title="Total Employees"
              value={filteredRecords.length}
              icon={Users}
            />
            <StatCard
              title="Present"
              value={
                filteredRecords.filter((r) => r.attendance?.regularCheckInTime)
                  .length
              }
              icon={UserCheck}
              className="bg-green-50"
            />
            <StatCard
              title="Absent"
              value={
                filteredRecords.filter(
                  (r) =>
                    !r.attendance?.regularCheckInTime &&
                    !r.leaveInfo &&
                    !r.isDayOff,
                ).length
              }
              icon={UserX}
              className="bg-red-50"
            />
            <StatCard
              title="On Leave"
              value={filteredRecords.filter((r) => r.leaveInfo).length}
              icon={CalendarDays}
              className="bg-blue-50"
            />
            <StatCard
              title="Day Off"
              value={filteredRecords.filter((r) => r.isDayOff).length}
              icon={CalendarDays}
              className="bg-gray-50"
            />
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processedRecords.map((record) => (
                  <TableRow
                    key={record.employeeId}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      setSelectedEmployee(record.employeeId);
                      setShowEmployeeDetail(true);
                    }}
                  >
                    <TableCell>
                      <div className="font-medium">{record.employeeName}</div>
                      <div className="text-sm text-gray-500">
                        {record.employeeId}
                      </div>
                    </TableCell>
                    <TableCell>{record.departmentName}</TableCell>
                    <TableCell>
                      {record.shift ? (
                        <div>
                          <div className="font-medium">{record.shift.name}</div>
                          <div className="text-sm text-gray-500">
                            {record.shift.startTime} - {record.shift.endTime}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">No shift assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.attendance?.regularCheckInTime ? (
                        <div className="flex items-center gap-2">
                          {format(
                            parseISO(record.attendance.regularCheckInTime),
                            'HH:mm',
                          )}
                          {record.attendance.isLateCheckIn && (
                            <Badge variant="warning" className="h-5">
                              Late
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.attendance?.regularCheckOutTime ? (
                        <div className="flex items-center gap-2">
                          {format(
                            parseISO(record.attendance.regularCheckOutTime),
                            'HH:mm',
                          )}
                          {record.attendance.isLateCheckOut && (
                            <Badge variant="warning" className="h-5">
                              Late
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(record)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEmployee(record.employeeId);
                          setShowEmployeeDetail(true);
                        }}
                      >
                        View Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-4"
                        onClick={() => {
                          setSelectedRecord(record);
                          setShowEditDialog(true);
                        }}
                      >
                        Edit Record
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Empty State */}
            {!isLoading && processedRecords.length === 0 && (
              <div className="text-center py-12">
                <Users className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No Records Found
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  No attendance records found for the selected filters.
                </p>
              </div>
            )}
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-4">
            {processedRecords.map((record) => (
              <AttendanceCard
                key={record.employeeId}
                record={record}
                onView={() => {
                  setSelectedEmployee(record.employeeId);
                  setShowEmployeeDetail(true);
                }}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Employee Detail Dialog */}
      <EmployeeDetailDialog
        open={showEmployeeDetail}
        onOpenChange={setShowEmployeeDetail}
        employeeId={selectedEmployee}
        date={filters.date}
      />
    </div>
  );
}

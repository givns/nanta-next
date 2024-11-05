// components/admin/attendance/DailyAttendanceView.tsx

import React, { useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useAttendance } from '@/hooks/useAttendance';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  User,
  Clock,
  Calendar as CalendarIcon,
  AlertCircle,
  Search,
  Loader2,
} from 'lucide-react';
import {
  DailyAttendanceResponse,
  ManualEntryRequest,
} from '@/types/attendance';
import { AttendanceApiService } from '@/services/attendanceApiService';

export default function DailyAttendanceView() {
  const { user } = useAdmin();
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
    refreshData,
  } = useAttendance({
    lineUserId: user?.lineUserId || null,
  });

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

  const getStatusBadge = (status: string | undefined) => {
    const styles = {
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      incomplete: 'bg-yellow-100 text-yellow-800',
      holiday: 'bg-purple-100 text-purple-800',
      off: 'bg-gray-100 text-gray-800',
      overtime: 'bg-blue-100 text-blue-800',
    };

    return (
      <Badge className={styles[status as keyof typeof styles] || styles.absent}>
        {status || 'Absent'}
      </Badge>
    );
  };

  // Mobile view card component
  const AttendanceCard = ({ record }: { record: DailyAttendanceResponse }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{record.employeeName}</div>
            <div className="text-sm text-gray-500">{record.departmentName}</div>
          </div>
          {getStatusBadge(record.attendance?.status)}
        </div>

        <div className="mt-4 space-y-2">
          {record.shift && (
            <div className="flex items-center text-sm">
              <Clock className="h-4 w-4 mr-2" />
              <span>
                {record.shift.startTime} - {record.shift.endTime}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <div className="text-sm text-gray-500">Check In</div>
              <div className="font-medium">
                {formatTimeOnly(record.attendance?.regularCheckInTime ?? null)}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Check Out</div>
              <div className="font-medium">
                {formatTimeOnly(record.attendance?.regularCheckOutTime ?? null)}
              </div>
            </div>
          </div>

          {record.attendance?.isLateCheckIn && (
            <div className="text-sm text-yellow-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              Late Check-in
            </div>
          )}
        </div>

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
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <CardTitle>Daily Attendance</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2">
              <CalendarIcon className="h-4 w-4" />
              {format(filters.date, 'EEEE, d MMMM yyyy', { locale: th })}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search employee..."
                value={filters.searchTerm}
                onChange={(e) => setFilters({ searchTerm: e.target.value })}
                className="pl-10"
              />
            </div>

            <Select
              value={filters.department}
              onValueChange={(value) => setFilters({ department: value })}
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

            <Calendar
              mode="single"
              selected={filters.date}
              onSelect={(date) => date && setFilters({ date })}
              className="rounded-md border"
            />
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          )}

          {/* Mobile View */}
          <div className="md:hidden">
            {filteredRecords.map((record) => (
              <AttendanceCard key={record.employeeId} record={record} />
            ))}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Check In</TableHead>
                    <TableHead>Check Out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((record) => (
                    <TableRow key={record.employeeId}>
                      <TableCell>
                        <div className="font-medium">{record.employeeName}</div>
                        <div className="text-sm text-gray-500">
                          {record.employeeId}
                        </div>
                      </TableCell>
                      <TableCell>{record.departmentName}</TableCell>
                      <TableCell>
                        {record.shift
                          ? `${record.shift.startTime} - ${record.shift.endTime}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {record.attendance?.regularCheckInTime &&
                            formatTimeOnly(
                              record.attendance.regularCheckInTime,
                            )}
                          {record.attendance?.isLateCheckIn && (
                            <Badge variant="warning" className="h-5">
                              Late
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {record.attendance?.regularCheckOutTime &&
                            formatTimeOnly(
                              record.attendance.regularCheckOutTime,
                            )}
                          {record.attendance?.isLateCheckOut && (
                            <Badge variant="warning" className="h-5">
                              Late
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(record.attendance?.status)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedRecord(record);
                            setShowEditDialog(true);
                          }}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Empty State */}
          {!isLoading && filteredRecords.length === 0 && (
            <div className="text-center py-12">
              <User className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No attendance records
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                No attendance records found for the selected filters
              </p>
            </div>
          )}
        </div>

        {/* Manual Entry Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Manual Attendance Entry</DialogTitle>
              {selectedRecord && (
                <div className="text-sm text-gray-500">
                  {selectedRecord.employeeName} -{' '}
                  {format(filters.date, 'dd MMM yyyy', { locale: th })}
                </div>
              )}
            </DialogHeader>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleManualEntry({
                  employeeId: selectedRecord!.employeeId,
                  date: format(filters.date, 'yyyy-MM-dd'),
                  checkInTime:
                    (formData.get('checkInTime') as string) || undefined,
                  checkOutTime:
                    (formData.get('checkOutTime') as string) || undefined,
                  reason: formData.get('reason') as string,
                });
              }}
            >
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="checkInTime" className="text-right">
                    Check In
                  </Label>
                  <div className="col-span-3">
                    <Input
                      id="checkInTime"
                      name="checkInTime"
                      type="time"
                      defaultValue={
                        selectedRecord?.attendance?.regularCheckInTime
                          ? formatTimeOnly(
                              selectedRecord.attendance.regularCheckInTime,
                            )
                          : undefined
                      }
                      disabled={isSubmitting}
                    />
                    {selectedRecord?.attendance?.isLateCheckIn && (
                      <p className="text-yellow-600 text-sm mt-1">
                        Original check-in was late
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="checkOutTime" className="text-right">
                    Check Out
                  </Label>
                  <div className="col-span-3">
                    <Input
                      id="checkOutTime"
                      name="checkOutTime"
                      type="time"
                      defaultValue={
                        selectedRecord?.attendance?.regularCheckOutTime
                          ? formatTimeOnly(
                              selectedRecord.attendance.regularCheckOutTime,
                            )
                          : undefined
                      }
                      disabled={isSubmitting}
                    />
                    {selectedRecord?.attendance?.isLateCheckOut && (
                      <p className="text-yellow-600 text-sm mt-1">
                        Original check-out was late
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="reason" className="text-right">
                    Reason
                  </Label>
                  <div className="col-span-3">
                    <Input
                      id="reason"
                      name="reason"
                      placeholder="Enter reason for manual entry"
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowEditDialog(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
// Helper function to format time without timezone conversion
const formatTimeOnly = (isoString: string | null): string => {
  if (!isoString) return '-';
  // Extract only the HH:mm part from the time string
  const timeMatch = isoString.match(/\d{2}:\d{2}/);
  return timeMatch ? timeMatch[0] : '-';
};
function setError(arg0: null) {
  throw new Error('Function not implemented.');
}

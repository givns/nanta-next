import React, { useState, useEffect } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
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
import { Badge } from '@/components/ui/badge';
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
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  User,
  Clock,
  Calendar as CalendarIcon,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';

interface DailyAttendanceRecord {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  date: string;
  shift: {
    startTime: string;
    endTime: string;
    name: string;
  } | null;
  attendance: {
    id: string;
    regularCheckInTime: string | null;
    regularCheckOutTime: string | null;
    isLateCheckIn: boolean;
    isLateCheckOut: boolean;
    isEarlyCheckIn: boolean;
    isVeryLateCheckOut: boolean;
    lateCheckOutMinutes: number;
    status:
      | 'present'
      | 'absent'
      | 'incomplete'
      | 'holiday'
      | 'off'
      | 'overtime';
  } | null;
}

export default function DailyAttendanceView() {
  const { user } = useAdmin();
  const [records, setRecords] = useState<DailyAttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [departments, setDepartments] = useState<string[]>([]);

  useEffect(() => {
    if (user?.lineUserId) {
      fetchDailyAttendance();
      fetchDepartments();
    }
  }, [user, selectedDate]);

  const fetchDepartments = async () => {
    try {
      const response = await fetch('/api/departments', {
        headers: {
          'x-line-userid': user?.lineUserId || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch departments');
      const data = await response.json();
      setDepartments(data.map((dept: any) => dept.name));
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchDailyAttendance = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/admin/attendance/daily?date=${selectedDate.toISOString()}`,
        {
          headers: {
            'x-line-userid': user?.lineUserId || '',
          },
        },
      );

      if (!response.ok) throw new Error('Failed to fetch attendance records');

      const data = await response.json();
      setRecords(data);
    } catch (error) {
      setError('Failed to load attendance records');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualEntry = async (data: {
    checkInTime?: string;
    checkOutTime?: string;
    reason: string;
  }) => {
    if (!selectedRecord) return;

    try {
      const response = await fetch('/api/admin/attendance/manual-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          employeeId: selectedRecord.employeeId,
          date: selectedDate.toISOString(),
          ...data,
        }),
      });

      if (!response.ok) throw new Error('Failed to create manual entry');

      await fetchDailyAttendance();
      setShowEditDialog(false);
      setSelectedRecord(null);
    } catch (error) {
      setError('Failed to create manual entry');
      console.error('Error:', error);
    }
  };

  const getStatusBadge = (
    status: string | undefined,
    record: DailyAttendanceRecord,
  ) => {
    if (!status || !record.attendance)
      return <Badge variant="destructive">Absent</Badge>;

    switch (status) {
      case 'present':
        if (record.attendance.isLateCheckIn) {
          return <Badge variant="warning">Late</Badge>;
        }
        return <Badge variant="success">Present</Badge>;
      case 'incomplete':
        return <Badge variant="default">In Progress</Badge>;
      case 'holiday':
        return <Badge variant="secondary">Holiday</Badge>;
      case 'off':
        return <Badge variant="secondary">Day Off</Badge>;
      case 'overtime':
        return <Badge variant="default">Overtime</Badge>;
      default:
        return <Badge variant="destructive">Absent</Badge>;
    }
  };

  // Filter records based on search and department
  const filteredRecords = records.filter((record) => {
    const matchesSearch =
      record.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment =
      selectedDepartment === 'all' ||
      record.departmentName === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  // Manual Entry Dialog
  const ManualEntryDialog = () => (
    <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manual Attendance Entry</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Check In</Label>
            <Input
              type="time"
              className="col-span-3"
              onChange={(e) => {
                // Handle check-in time change
              }}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Check Out</Label>
            <Input
              type="time"
              className="col-span-3"
              onChange={(e) => {
                // Handle check-out time change
              }}
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Reason</Label>
            <Input
              className="col-span-3"
              placeholder="Enter reason for manual entry"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit">Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const AttendanceCard = ({ record }: { record: DailyAttendanceRecord }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{record.employeeName}</div>
            <div className="text-sm text-gray-500">{record.departmentName}</div>
          </div>
          {getStatusBadge(record.attendance?.status, record)}
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

          {record.attendance && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Check In</div>
                <div className="font-medium">
                  {record.attendance.regularCheckInTime
                    ? format(
                        parseISO(record.attendance.regularCheckInTime),
                        'HH:mm',
                      )
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Check Out</div>
                <div className="font-medium">
                  {record.attendance.regularCheckOutTime
                    ? format(
                        parseISO(record.attendance.regularCheckOutTime),
                        'HH:mm',
                      )
                    : '-'}
                </div>
              </div>
            </div>
          )}

          {record.attendance?.isLateCheckIn && (
            <div className="text-sm text-yellow-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              Late Check-in
            </div>
          )}

          {record.attendance?.isLateCheckOut && (
            <div className="text-sm text-yellow-600 flex items-center">
              <AlertCircle className="h-4 w-4 mr-1" />
              Late Check-out ({record.attendance.lateCheckOutMinutes} minutes)
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
              {format(selectedDate, 'EEEE, d MMMM yyyy', { locale: th })}
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
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search employee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border"
            />
          </div>

          {/* Mobile View */}
          <div className="md:hidden">
            {filteredRecords.map((record) => (
              <AttendanceCard key={record.employeeId} record={record} />
            ))}
          </div>

          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto">
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
                      {record.attendance?.regularCheckInTime
                        ? format(
                            parseISO(record.attendance.regularCheckInTime),
                            'HH:mm',
                          )
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {record.attendance?.regularCheckOutTime
                        ? format(
                            parseISO(record.attendance.regularCheckOutTime),
                            'HH:mm',
                          )
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(record.attendance?.status, record)}
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

        {/* Manual Entry Dialog */}
        <ManualEntryDialog />
      </CardContent>
    </Card>
  );
}

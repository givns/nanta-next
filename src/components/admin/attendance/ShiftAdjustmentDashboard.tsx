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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
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
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarDays, Users, Clock, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Department {
  id: string;
  name: string;
}

interface Shift {
  id: string;
  name: string;
  shiftCode: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

interface ShiftAdjustment {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  currentShift: Shift;
  requestedShift: Shift;
  date: Date;
  reason: string;
  status: 'approved' | 'pending' | 'rejected';
}

export default function ShiftAdjustmentDashboard() {
  const { user } = useAdmin();
  const [showAdjustmentDialog, setShowAdjustmentDialog] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [adjustments, setAdjustments] = useState<ShiftAdjustment[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [targetType, setTargetType] = useState<'department' | 'individual'>(
    'department',
  );
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (user?.lineUserId) {
      fetchInitialData();
    }
  }, [user]);

  const fetchInitialData = async () => {
    try {
      setIsLoading(true);
      const [shiftsResponse, departmentsResponse, adjustmentsResponse] =
        await Promise.all([
          fetch('/api/shifts/shifts', {
            headers: { 'x-line-userid': user?.lineUserId || '' },
          }),
          fetch('/api/departments', {
            headers: { 'x-line-userid': user?.lineUserId || '' },
          }),
          fetch('/api/admin/shift-adjustments', {
            headers: { 'x-line-userid': user?.lineUserId || '' },
          }),
        ]);

      const shiftsData = await shiftsResponse.json();
      const departmentsData = await departmentsResponse.json();
      const adjustmentsData = await adjustmentsResponse.json();

      setShifts(shiftsData);
      setDepartments(departmentsData);
      setAdjustments(adjustmentsData);
    } catch (error) {
      setError('Failed to load initial data');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/adjust-shift', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user?.lineUserId || '',
        },
        body: JSON.stringify({
          lineUserId: user?.lineUserId,
          targetType,
          adjustments:
            targetType === 'department'
              ? selectedDepartments.map((deptId) => ({
                  department: deptId,
                  shiftId: selectedShift,
                }))
              : [{ employeeId: searchTerm, shiftId: selectedShift }],
          date: selectedDate,
          reason,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit adjustment');
      }

      await fetchInitialData();
      setShowAdjustmentDialog(false);
      resetForm();
    } catch (error) {
      setError('Failed to submit shift adjustment');
      console.error('Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setTargetType('department');
    setSelectedDepartments([]);
    setSelectedShift('');
    setSelectedDate(new Date());
    setReason('');
  };

  // Mobile card component
  const AdjustmentCard = ({ adjustment }: { adjustment: ShiftAdjustment }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{adjustment.employeeName}</div>
            <div className="text-sm text-gray-500">{adjustment.department}</div>
          </div>
          <Badge
            variant={
              adjustment.status === 'approved'
                ? 'success'
                : adjustment.status === 'rejected'
                  ? 'destructive'
                  : 'default'
            }
          >
            {adjustment.status}
          </Badge>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center text-sm">
            <CalendarDays className="h-4 w-4 mr-2" />
            <span>
              {format(adjustment.date, 'dd MMM yyyy', { locale: th })}
            </span>
          </div>
          <div className="flex items-center text-sm">
            <Clock className="h-4 w-4 mr-2" />
            <span>
              {adjustment.requestedShift.startTime} -{' '}
              {adjustment.requestedShift.endTime}
            </span>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm text-gray-500">Reason:</div>
          <p className="text-sm mt-1">{adjustment.reason}</p>
        </div>
      </CardContent>
    </Card>
  );

  // Filter section
  const FilterSection = () => (
    <div className="space-y-4 mb-6">
      <div className="flex flex-col md:flex-row gap-4">
        <Select
          value={targetType}
          onValueChange={(type) =>
            setTargetType(type as 'department' | 'individual')
          }
        >
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Adjustment Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="department">Department</SelectItem>
            <SelectItem value="individual">Individual</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1">
          <Input
            placeholder={
              targetType === 'individual'
                ? 'Search by Employee ID...'
                : 'Search...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>
    </div>
  );

  // Desktop table
  const DesktopTable = () => (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee/Department</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Current Shift</TableHead>
            <TableHead>New Shift</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adjustments.map((adjustment) => (
            <TableRow key={adjustment.id}>
              <TableCell>
                <div>
                  <div className="font-medium">{adjustment.employeeName}</div>
                  <div className="text-sm text-gray-500">
                    {adjustment.department}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {format(adjustment.date, 'dd MMM yyyy', { locale: th })}
              </TableCell>
              <TableCell>
                {`${adjustment.currentShift.name} (${adjustment.currentShift.startTime} - ${adjustment.currentShift.endTime})`}
              </TableCell>
              <TableCell>
                {`${adjustment.requestedShift.name} (${adjustment.requestedShift.startTime} - ${adjustment.requestedShift.endTime})`}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    adjustment.status === 'approved'
                      ? 'success'
                      : adjustment.status === 'rejected'
                        ? 'destructive'
                        : 'default'
                  }
                >
                  {adjustment.status}
                </Badge>
              </TableCell>
              <TableCell className="max-w-[200px] truncate">
                {adjustment.reason}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <CardTitle>Shift Adjustments</CardTitle>
          <Button onClick={() => setShowAdjustmentDialog(true)}>
            New Adjustment
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <FilterSection />

        {/* Mobile View */}
        <div className="md:hidden">
          {adjustments.map((adjustment) => (
            <AdjustmentCard key={adjustment.id} adjustment={adjustment} />
          ))}
        </div>

        {/* Desktop View */}
        <DesktopTable />

        {/* New Adjustment Dialog */}
        <Dialog
          open={showAdjustmentDialog}
          onOpenChange={setShowAdjustmentDialog}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Shift Adjustment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Target Type</Label>
                <Select
                  value={targetType}
                  onValueChange={(value: 'department' | 'individual') =>
                    setTargetType(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select target type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="individual">Individual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {targetType === 'department' ? (
                <div>
                  <Label>Departments</Label>
                  <Select
                    value={selectedDepartments[0]}
                    onValueChange={(value) => setSelectedDepartments([value])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select departments" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Employee ID</Label>
                  <Input
                    placeholder="Enter employee ID"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label>New Shift</Label>
                <Select value={selectedShift} onValueChange={setSelectedShift}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    {shifts.map((shift) => (
                      <SelectItem key={shift.id} value={shift.id}>
                        {shift.name} ({shift.startTime} - {shift.endTime})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Date</Label>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  disabled={(date) => date < new Date()}
                  className="rounded-md border"
                />
              </div>

              <div>
                <Label>Reason</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason for shift adjustment"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowAdjustmentDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !selectedShift || !reason}
              >
                {isLoading ? 'Submitting...' : 'Submit Adjustment'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

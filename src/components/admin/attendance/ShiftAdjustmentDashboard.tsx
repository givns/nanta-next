// components/admin/attendance/ShiftAdjustmentDashboard.tsx
import { useState, useEffect, useCallback } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateSelector } from './components/DateSelector';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import { Textarea } from '@/components/ui/textarea';

interface ShiftAdjustment {
  id: string;
  employeeId: string;
  user: {
    employeeId: string;
    name: string;
    departmentName: string;
    assignedShift: {
      name: string;
      startTime: string;
      endTime: string;
    } | null;
  };
  requestedShift: {
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
  };
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export default function ShiftAdjustmentDashboard() {
  const { lineUserId } = useLiff();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [adjustments, setAdjustments] = useState<ShiftAdjustment[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [shifts, setShifts] = useState<{ shiftCode: string; name: string }[]>(
    [],
  );

  // Form/Filter States
  const [period, setPeriod] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  });
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [adjustmentType, setAdjustmentType] = useState<
    'individual' | 'department'
  >('individual');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedShift, setSelectedShift] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date());
  const [reason, setReason] = useState('');
  const [selectedDeptForAdjustment, setSelectedDeptForAdjustment] =
    useState('');

  const fetchInitialData = useCallback(async () => {
    if (!lineUserId) {
      setError('Authentication required');
      return;
    }

    try {
      setIsLoading(true);
      const headers = { 'x-line-userid': lineUserId };

      const [shiftsRes, deptsRes] = await Promise.all([
        fetch('/api/shifts/shifts', { headers }),
        fetch('/api/departments', { headers }),
      ]);

      if (!shiftsRes.ok || !deptsRes.ok) {
        throw new Error('Failed to fetch initial data');
      }

      const [shiftsData, deptsData] = await Promise.all([
        shiftsRes.json(),
        deptsRes.json(),
      ]);

      setShifts(shiftsData);
      setDepartments(deptsData);

      await fetchAdjustments();
    } catch (error) {
      console.error('Error fetching initial data:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to load initial data',
      );
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId]);

  const fetchAdjustments = useCallback(async () => {
    if (!lineUserId) return;

    try {
      const queryParams = new URLSearchParams({
        startDate: period.start.toISOString(),
        endDate: period.end.toISOString(),
        ...(selectedDepartment !== 'all' && {
          departmentName: selectedDepartment,
        }),
      });

      const response = await fetch(
        `/api/admin/shifts/adjustments?${queryParams}`,
        {
          headers: { 'x-line-userid': lineUserId },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch adjustments');
      }

      const data = await response.json();
      setAdjustments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching adjustments:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to fetch adjustments',
      );
    }
  }, [lineUserId, period, selectedDepartment]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleSubmitAdjustment = async () => {
    if (!lineUserId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Authentication required',
      });
      return;
    }

    try {
      const payload = {
        type: adjustmentType,
        ...(adjustmentType === 'department'
          ? { departmentName: selectedDeptForAdjustment }
          : { employees: selectedEmployees }),
        shiftCode: selectedShift,
        date: adjustmentDate.toISOString(),
        reason,
      };

      const response = await fetch('/api/admin/shifts/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create adjustment');
      }

      toast({
        title: 'Success',
        description: 'Shift adjustment(s) created successfully',
      });

      setShowDialog(false);
      fetchAdjustments();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to create adjustment',
      });
    }
  };

  // Filter and group adjustments
  const filteredAdjustments = adjustments.filter(
    (adj) =>
      searchTerm === '' ||
      adj.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adj.user.employeeId.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const groupedAdjustments = filteredAdjustments.reduce(
    (acc, curr) => {
      const date = format(parseISO(curr.date), 'yyyy-MM-dd');
      if (!acc[date]) acc[date] = [];
      acc[date].push(curr);
      return acc;
    },
    {} as Record<string, ShiftAdjustment[]>,
  );

  // Return JSX
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Shift Adjustments</CardTitle>
          <Button onClick={() => setShowDialog(true)}>New Adjustment</Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter Controls */}
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Period Selection */}
            <div>
              <Label>Period</Label>
              <div className="flex gap-2">
                <DateSelector
                  date={period.start}
                  onChange={(date) =>
                    setPeriod((prev) => ({
                      ...prev,
                      start: date || prev.start,
                    }))
                  }
                />
                <span className="self-center">to</span>
                <DateSelector
                  date={period.end}
                  onChange={(date) =>
                    setPeriod((prev) => ({
                      ...prev,
                      end: date || prev.end,
                    }))
                  }
                />
              </div>
            </div>

            {/* Department Filter */}
            <div>
              <Label>Department</Label>
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
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
            </div>

            {/* Search */}
            <div>
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Adjustments List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : Object.keys(groupedAdjustments).length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No adjustments found
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedAdjustments)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([date, adjustments]) => (
                <div key={date} className="space-y-2">
                  <h3 className="font-medium">
                    {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Current Shift</TableHead>
                        <TableHead>New Shift</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjustments.map((adj) => (
                        <TableRow key={adj.id}>
                          <TableCell>
                            <div>
                              {adj.user.name}
                              <div className="text-sm text-gray-500">
                                ID: {adj.user.employeeId}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{adj.user.departmentName}</TableCell>
                          {/* Continuing the TableCell content */}
                          <TableCell>
                            {adj.user.assignedShift ? (
                              <>
                                <div>{adj.user.assignedShift.name}</div>
                                <div className="text-sm text-gray-500">
                                  {adj.user.assignedShift.startTime} -{' '}
                                  {adj.user.assignedShift.endTime}
                                </div>
                              </>
                            ) : (
                              'No shift assigned'
                            )}
                          </TableCell>
                          <TableCell>
                            <div>{adj.requestedShift.name}</div>
                            <div className="text-sm text-gray-500">
                              {adj.requestedShift.startTime} -{' '}
                              {adj.requestedShift.endTime}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                adj.status === 'approved'
                                  ? 'success'
                                  : adj.status === 'rejected'
                                    ? 'destructive'
                                    : 'default'
                              }
                            >
                              {adj.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">{adj.reason}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      {/* New Adjustment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Shift Adjustment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Adjustment Type Selection */}
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <div className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="individual"
                    value="individual"
                    checked={adjustmentType === 'individual'}
                    onChange={(e) =>
                      setAdjustmentType(
                        e.target.value as 'individual' | 'department',
                      )
                    }
                    className="rounded-full"
                  />
                  <Label htmlFor="individual">Individual</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="department"
                    value="department"
                    checked={adjustmentType === 'department'}
                    onChange={(e) =>
                      setAdjustmentType(
                        e.target.value as 'individual' | 'department',
                      )
                    }
                    className="rounded-full"
                  />
                  <Label htmlFor="department">Department</Label>
                </div>
              </div>
            </div>

            {/* Employee or Department Selection */}
            {adjustmentType === 'individual' ? (
              <div className="space-y-2">
                <Label>Employee IDs</Label>
                <Textarea
                  placeholder="Enter employee IDs (one per line)"
                  value={selectedEmployees.join('\n')}
                  onChange={(e) =>
                    setSelectedEmployees(
                      e.target.value
                        .split('\n')
                        .map((id) => id.trim())
                        .filter(Boolean),
                    )
                  }
                  className="h-24"
                />
                <p className="text-sm text-gray-500">
                  Enter one employee ID per line
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Department</Label>
                <Select
                  value={selectedDeptForAdjustment}
                  onValueChange={setSelectedDeptForAdjustment}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Shift Selection */}
            <div className="space-y-2">
              <Label>New Shift</Label>
              <Select value={selectedShift} onValueChange={setSelectedShift}>
                <SelectTrigger>
                  <SelectValue placeholder="Select shift" />
                </SelectTrigger>
                <SelectContent>
                  {shifts.map((shift) => (
                    <SelectItem key={shift.shiftCode} value={shift.shiftCode}>
                      {shift.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Selection */}
            <div className="space-y-2">
              <Label>Adjustment Date</Label>
              <DateSelector
                date={adjustmentDate}
                onChange={(date) => setAdjustmentDate(date || new Date())}
              />
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason for Adjustment</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason for shift adjustment"
                className="h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitAdjustment}
              disabled={
                (adjustmentType === 'individual' &&
                  selectedEmployees.length === 0) ||
                (adjustmentType === 'department' &&
                  !selectedDeptForAdjustment) ||
                !selectedShift ||
                !reason
              }
            >
              Create Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

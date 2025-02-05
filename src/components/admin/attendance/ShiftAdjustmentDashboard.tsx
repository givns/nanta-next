// components/admin/attendance/ShiftAdjustmentDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateSelector } from './components/DateSelector';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2, Search, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { LoadingSpinner } from '../../LoadingSpinnner';
import { ShiftAdjustmentForm } from './ShiftAdjustmentForm';

interface User {
  id: string;
  employeeId: string;
  name: string;
  departmentName: string;
  shiftCode?: string;
}

interface Shift {
  id: string;
  shiftCode: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface Department {
  id: string;
  name: string;
}

interface ShiftAdjustment {
  id: string;
  employeeId: string;
  user: {
    name: string;
    departmentName: string;
  };
  date: string;
  originalShift: Shift;
  requestedShift: Shift;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
}

export default function ShiftAdjustmentDashboard() {
  const { lineUserId } = useLiff();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [adjustments, setAdjustments] = useState<ShiftAdjustment[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // Filter states
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  });
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // UI states
  const [showNewAdjustmentDialog, setShowNewAdjustmentDialog] = useState(false);

  const fetchData = useCallback(async () => {
    if (!lineUserId) return;

    try {
      setIsLoading(true);
      const headers = { 'x-line-userid': lineUserId };
      const queryParams = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString(),
        ...(selectedDepartment !== 'all' && {
          departmentId: selectedDepartment,
        }),
        ...(selectedStatus !== 'all' && { status: selectedStatus }),
      });

      const [shiftsRes, deptsRes, adjustmentsRes] = await Promise.all([
        fetch('/api/shifts/shifts', { headers }),
        fetch('/api/departments', { headers }),
        fetch(`/api/admin/shifts/adjustments?${queryParams}`, { headers }),
      ]);

      if (!shiftsRes.ok || !deptsRes.ok || !adjustmentsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [shiftsData, deptsData, adjustmentsData] = await Promise.all([
        shiftsRes.json(),
        deptsRes.json(),
        adjustmentsRes.json(),
      ]);

      setShifts(shiftsData);
      setDepartments(deptsData);
      setAdjustments(adjustmentsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId, dateRange, selectedDepartment, selectedStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter adjustments based on search term
  const filteredAdjustments = adjustments.filter(
    (adj) =>
      searchTerm === '' ||
      adj.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      adj.employeeId.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  // Group adjustments by date
  const groupedAdjustments = filteredAdjustments.reduce(
    (acc, curr) => {
      const date = format(parseISO(curr.date), 'yyyy-MM-dd');
      if (!acc[date]) acc[date] = [];
      acc[date].push(curr);
      return acc;
    },
    {} as Record<string, ShiftAdjustment[]>,
  );

  const handleStatusChange = async (
    adjustmentId: string,
    newStatus: 'approved' | 'rejected',
  ) => {
    try {
      const response = await fetch(
        `/api/admin/shifts/adjustments/${adjustmentId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-line-userid': lineUserId || '',
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );

      if (!response.ok) throw new Error('Failed to update status');

      await fetchData();
      toast({
        title: 'Success',
        description: `Adjustment ${newStatus} successfully`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update adjustment status',
      });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Shift Adjustments</h2>
        <Button onClick={() => setShowNewAdjustmentDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Adjustment
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Range */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="flex gap-2">
                <DateSelector
                  date={dateRange.start}
                  onChange={(date) =>
                    setDateRange((prev) => ({
                      ...prev,
                      start: date || prev.start,
                    }))
                  }
                />
                <span className="self-center">to</span>
                <DateSelector
                  date={dateRange.end}
                  onChange={(date) =>
                    setDateRange((prev) => ({
                      ...prev,
                      end: date || prev.end,
                    }))
                  }
                />
              </div>
            </div>

            {/* Department Filter */}
            <div className="space-y-2">
              <Label>Department</Label>
              <Select
                value={selectedDepartment}
                onValueChange={setSelectedDepartment}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Departments" />
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

            {/* Status Filter */}
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-2">
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
        </CardContent>
      </Card>

      {/* Adjustments List */}
      <Card>
        <CardContent className="p-6">
          {Object.entries(groupedAdjustments)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, adjustments]) => (
              <div key={date} className="mb-6 last:mb-0">
                <h3 className="text-lg font-medium mb-4">
                  {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Current Shift</TableHead>
                      <TableHead>Requested Shift</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustments.map((adj) => (
                      <TableRow key={adj.id}>
                        <TableCell>
                          <div className="font-medium">{adj.user.name}</div>
                          <div className="text-sm text-gray-500">
                            ID: {adj.employeeId}
                          </div>
                        </TableCell>
                        <TableCell>{adj.user.departmentName}</TableCell>
                        <TableCell>
                          <div>{adj.originalShift.name}</div>
                          <div className="text-sm text-gray-500">
                            {adj.originalShift.startTime} -{' '}
                            {adj.originalShift.endTime}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{adj.requestedShift.name}</div>
                          <div className="text-sm text-gray-500">
                            {adj.requestedShift.startTime} -{' '}
                            {adj.requestedShift.endTime}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{adj.reason}</span>
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
                          {adj.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleStatusChange(adj.id, 'approved')
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  handleStatusChange(adj.id, 'rejected')
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}

          {filteredAdjustments.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No adjustments found
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Adjustment Dialog */}
      <Dialog
        open={showNewAdjustmentDialog}
        onOpenChange={setShowNewAdjustmentDialog}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Shift Adjustment</DialogTitle>
          </DialogHeader>
          <ShiftAdjustmentForm
            departments={departments}
            shifts={shifts}
            onSubmit={async (data) => {
              try {
                const response = await fetch('/api/admin/shifts/adjustments', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-line-userid': lineUserId || '',
                  },
                  body: JSON.stringify(data),
                });

                if (!response.ok)
                  throw new Error('Failed to create adjustment');

                await fetchData();
                setShowNewAdjustmentDialog(false);
                toast({
                  title: 'Success',
                  description: 'Shift adjustment created successfully',
                });
              } catch (error) {
                toast({
                  variant: 'destructive',
                  title: 'Error',
                  description: 'Failed to create shift adjustment',
                });
              }
            }}
            onCancel={() => setShowNewAdjustmentDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

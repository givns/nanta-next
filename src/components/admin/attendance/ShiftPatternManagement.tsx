// components/admin/attendance/ShiftPatternManagement.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingSpinner } from '../../LoadingSpinnner';
import {
  Plus,
  MoreHorizontal,
  Users,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import ShiftPatternForm from './ShiftPatternForm';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  departmentName: string;
  shiftCode: string;
}

interface Shift {
  id: string;
  shiftCode: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

interface Department {
  id: string;
  name: string;
}

export default function ShiftPatternManagement() {
  const { lineUserId } = useLiff();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Record<string, Employee[]>>({});

  // UI states
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [expandedShift, setExpandedShift] = useState<string | null>(null);
  const [showNewShiftDialog, setShowNewShiftDialog] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  const fetchData = useCallback(async () => {
    if (!lineUserId) return;

    try {
      setIsLoading(true);
      const headers = { 'x-line-userid': lineUserId };

      const [shiftsRes, deptsRes] = await Promise.all([
        fetch('/api/shifts/shifts', { headers }),
        fetch('/api/departments', { headers }),
      ]);

      if (!shiftsRes.ok || !deptsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const [shiftsData, deptsData] = await Promise.all([
        shiftsRes.json(),
        deptsRes.json(),
      ]);

      setShifts(shiftsData);
      setDepartments(deptsData);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId]);

  const fetchEmployeesForDepartment = async (departmentId: string) => {
    if (!lineUserId || !departmentId) return;

    try {
      const response = await fetch(
        `/api/departments/${departmentId}/employees`,
        {
          headers: { 'x-line-userid': lineUserId },
        },
      );

      if (!response.ok) throw new Error('Failed to fetch employees');

      const employeesData = await response.json();
      setEmployees((prev) => ({
        ...prev,
        [departmentId]: employeesData,
      }));
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load employees',
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDepartmentSelect = async (deptId: string) => {
    setSelectedDepartment(deptId);
    if (!employees[deptId]) {
      await fetchEmployeesForDepartment(deptId);
    }
  };

  const handleShiftCreate = async (shiftData: {
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  }) => {
    try {
      const response = await fetch('/api/shifts/shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId || '',
        },
        body: JSON.stringify(shiftData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create shift pattern');
      }

      await fetchData();
      setShowNewShiftDialog(false);
      toast({
        title: 'Success',
        description: 'Shift pattern created successfully',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to create shift pattern',
      });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Shift Patterns</h2>
        <Button onClick={() => setShowNewShiftDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Shift Pattern
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Available Shifts</CardTitle>
            <Select
              value={selectedDepartment}
              onValueChange={handleDepartmentSelect}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Work Days</TableHead>
                <TableHead>Actions</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <React.Fragment key={shift.id}>
                  <TableRow>
                    <TableCell>{shift.shiftCode}</TableCell>
                    <TableCell>{shift.name}</TableCell>
                    <TableCell>
                      {shift.startTime} - {shift.endTime}
                    </TableCell>
                    <TableCell>
                      {shift.workDays
                        .map(
                          (day) =>
                            ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
                              day
                            ],
                        )
                        .join(', ')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditingShift(shift)}
                          >
                            Edit Pattern
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setExpandedShift(
                                expandedShift === shift.id ? null : shift.id,
                              )
                            }
                          >
                            View Employees
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedShift(
                            expandedShift === shift.id ? null : shift.id,
                          )
                        }
                      >
                        {expandedShift === shift.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expandedShift === shift.id &&
                    selectedDepartment &&
                    employees[selectedDepartment] && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-slate-50">
                          <div className="p-4">
                            <div className="flex items-center gap-2 mb-4">
                              <Users className="h-4 w-4" />
                              <h4 className="font-medium">
                                Employees in this shift
                              </h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {employees[selectedDepartment]
                                .filter(
                                  (emp) => emp.shiftCode === shift.shiftCode,
                                )
                                .map((employee) => (
                                  <div
                                    key={employee.id}
                                    className="p-3 bg-white rounded-lg shadow-sm flex items-center justify-between"
                                  >
                                    <div>
                                      <p className="font-medium">
                                        {employee.name}
                                      </p>
                                      <p className="text-sm text-gray-500">
                                        ID: {employee.employeeId}
                                      </p>
                                    </div>
                                    <Badge>{employee.departmentName}</Badge>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New Shift Pattern Dialog */}
      <Dialog open={showNewShiftDialog} onOpenChange={setShowNewShiftDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Shift Pattern</DialogTitle>
          </DialogHeader>
          <ShiftPatternForm
            onSubmit={handleShiftCreate}
            onCancel={() => setShowNewShiftDialog(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Shift Pattern Dialog */}
      <Dialog
        open={!!editingShift}
        onOpenChange={(open) => !open && setEditingShift(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Shift Pattern</DialogTitle>
          </DialogHeader>
          {editingShift && (
            <ShiftPatternForm
              initialData={editingShift}
              onSubmit={async (data) => {
                try {
                  const response = await fetch(
                    `/api/shifts/shifts/${editingShift.id}`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        'x-line-userid': lineUserId || '',
                      },
                      body: JSON.stringify(data),
                    },
                  );

                  if (!response.ok)
                    throw new Error('Failed to update shift pattern');

                  await fetchData();
                  setEditingShift(null);
                  toast({
                    title: 'Success',
                    description: 'Shift pattern updated successfully',
                  });
                } catch (error) {
                  toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to update shift pattern',
                  });
                }
              }}
              onCancel={() => setEditingShift(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

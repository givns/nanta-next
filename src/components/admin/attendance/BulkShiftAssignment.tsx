// components/admin/attendance/BulkShiftAssignment.tsx

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Employee {
  id: string;
  name: string;
  department: string;
  currentShift: string;
}

interface Shift {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
}

export default function BulkShiftAssignment() {
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [effectiveDate, setEffectiveDate] = useState<Date | undefined>(
    new Date(),
  );
  const { toast } = useToast();

  // Sample data - replace with API calls
  const employees: Employee[] = [];
  const shifts: Shift[] = [];
  const departments: string[] = [];

  const handleSelectAllEmployees = (checked: boolean) => {
    if (checked) {
      setSelectedEmployees(employees.map((emp) => emp.id));
    } else {
      setSelectedEmployees([]);
    }
  };

  const handleSubmit = async () => {
    try {
      if (!selectedShift || !effectiveDate || selectedEmployees.length === 0) {
        toast({
          title: 'Missing Information',
          description: 'Please fill in all required fields',
          variant: 'destructive',
        });
        return;
      }

      const response = await fetch('/api/admin/shifts/bulk-assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shiftId: selectedShift,
          employeeIds: selectedEmployees,
          effectiveDate,
        }),
      });

      if (!response.ok) throw new Error('Failed to assign shifts');

      toast({
        title: 'Success',
        description: 'Shifts assigned successfully',
      });

      // Reset selections
      setSelectedEmployees([]);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to assign shifts',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Shift Assignment</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select Department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedShift} onValueChange={setSelectedShift}>
              <SelectTrigger>
                <SelectValue placeholder="Select New Shift" />
              </SelectTrigger>
              <SelectContent>
                {shifts.map((shift) => (
                  <SelectItem key={shift.id} value={shift.id}>
                    {shift.name} ({shift.startTime} - {shift.endTime})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div>
              <Calendar
                mode="single"
                selected={effectiveDate}
                onSelect={setEffectiveDate}
                disabled={(date) => date < new Date()}
                className="rounded-md border"
              />
            </div>
          </div>

          {/* Employee Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={selectedEmployees.length === employees.length}
                    onCheckedChange={handleSelectAllEmployees}
                  />
                </TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Current Shift</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedEmployees.includes(employee.id)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedEmployees([
                            ...selectedEmployees,
                            employee.id,
                          ]);
                        } else {
                          setSelectedEmployees(
                            selectedEmployees.filter(
                              (id) => id !== employee.id,
                            ),
                          );
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell>{employee.name}</TableCell>
                  <TableCell>{employee.department}</TableCell>
                  <TableCell>{employee.currentShift}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4">
            <Button variant="outline">Cancel</Button>
            <Button onClick={handleSubmit}>Assign Shifts</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

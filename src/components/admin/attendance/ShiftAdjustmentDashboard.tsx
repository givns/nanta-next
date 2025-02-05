// components/admin/attendance/ShiftAdjustmentDashboard.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useLiff } from '@/contexts/LiffContext';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateSelector } from './components/DateSelector';
import { LoadingSpinner } from '../../LoadingSpinnner';
import { Search } from 'lucide-react';
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

interface ShiftData {
  id: string;
  shiftCode: string;
  name: string;
  startTime: string;
  endTime: string;
  workDays: number[];
}

interface DepartmentData {
  id: string;
  name: string;
}

export default function ShiftAdjustmentDashboard() {
  // State for data
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [departments, setDepartments] = useState<DepartmentData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  });

  const { lineUserId } = useLiff();
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    if (!lineUserId) {
      setError('Authentication required');
      return;
    }

    try {
      setIsLoading(true);
      const headers = { 'x-line-userid': lineUserId };

      // Fetch shifts and departments in parallel
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

      // Log the received data
      console.log('Shifts:', shiftsData);
      console.log('Departments:', deptsData);

      setShifts(shiftsData);
      setDepartments(deptsData);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [lineUserId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

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
      {/* Filters Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
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
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Available Shifts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Available Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Start Time</TableHead>
                <TableHead>End Time</TableHead>
                <TableHead>Work Days</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell>{shift.shiftCode}</TableCell>
                  <TableCell>{shift.name}</TableCell>
                  <TableCell>{shift.startTime}</TableCell>
                  <TableCell>{shift.endTime}</TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Departments List */}
      <Card>
        <CardHeader>
          <CardTitle>Departments</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((dept) => (
                <TableRow key={dept.id}>
                  <TableCell>{dept.name}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// components/admin/leaves/holidays/NoWorkDayManagement.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarDays, Users, X, Calendar as CalendarIcon } from 'lucide-react';

interface NoWorkDay {
  id: string;
  date: Date;
  reason: string;
  departments: string[];
  affectedEmployees: number;
  createdBy: string;
  createdAt: Date;
}

interface Department {
  id: string;
  name: string;
  employeeCount: number;
}

export default function NoWorkDayManagement() {
  const [noWorkDays, setNoWorkDays] = useState<NoWorkDay[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const [reason, setReason] = useState('');

  // Mobile card component for no-work day
  const NoWorkDayCard = ({ day }: { day: NoWorkDay }) => (
    <Card className="mb-4 md:hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-sm text-gray-500">
              {format(day.date, 'EEEE', { locale: th })}
            </div>
            <div className="font-medium">
              {format(day.date, 'd MMMM yyyy', { locale: th })}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-700"
            onClick={() => handleDelete(day.id)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium">Reason</div>
          <div className="text-sm text-gray-600">{day.reason}</div>
        </div>

        <div className="mt-4">
          <div className="text-sm font-medium">Affected Departments</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {day.departments.map((dept, index) => (
              <Badge key={index} variant="outline">
                {dept}
              </Badge>
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center text-sm text-gray-500">
          <Users className="h-4 w-4 mr-1" />
          {day.affectedEmployees} employees affected
        </div>
      </CardContent>
    </Card>
  );

  // Desktop table component
  const NoWorkDayTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Departments</TableHead>
            <TableHead className="text-right">Affected Employees</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {noWorkDays.map((day) => (
            <TableRow key={day.id}>
              <TableCell>
                <div>
                  <div className="font-medium">
                    {format(day.date, 'd MMMM yyyy', { locale: th })}
                  </div>
                  <div className="text-sm text-gray-500">
                    {format(day.date, 'EEEE', { locale: th })}
                  </div>
                </div>
              </TableCell>
              <TableCell>{day.reason}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {day.departments.map((dept, index) => (
                    <Badge key={index} variant="outline">
                      {dept}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-right">
                <span className="flex items-center justify-end text-gray-500">
                  <Users className="h-4 w-4 mr-1" />
                  {day.affectedEmployees}
                </span>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => handleDelete(day.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  // Add no-work day dialog
  const AddNoWorkDayDialog = () => (
    <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add No-Work Day</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Date</Label>
            <div className="mt-2">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                className="rounded-md border"
              />
            </div>
          </div>

          <div>
            <Label>Reason</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for no-work day"
            />
          </div>

          <div>
            <Label>Affected Departments</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select departments" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name} ({dept.employeeCount} employees)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedDepartments.map((deptId) => {
                const dept = departments.find((d) => d.id === deptId);
                return dept ? (
                  <Badge
                    key={deptId}
                    variant="outline"
                    className="flex items-center gap-1"
                  >
                    {dept.name}
                    <button
                      onClick={() => handleRemoveDepartment(deptId)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ) : null;
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddNoWorkDay}>Add No-Work Day</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Event handlers
  const handleAddNoWorkDay = () => {
    // Add no-work day logic
    setShowAddDialog(false);
  };

  const handleDelete = (id: string) => {
    // Delete no-work day logic
  };

  const handleRemoveDepartment = (deptId: string) => {
    setSelectedDepartments((prevDepts) =>
      prevDepts.filter((id) => id !== deptId),
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <CardTitle>No-Work Days</CardTitle>
            <p className="text-sm text-gray-500">
              Manage special no-work days and affected departments
            </p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            Add No-Work Day
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <p className="text-sm text-gray-500">Upcoming</p>
                  <p className="text-2xl font-bold">
                    {noWorkDays.filter((d) => d.date > new Date()).length}
                  </p>
                </div>
                <CalendarDays className="text-gray-400" />
              </div>
            </CardContent>
          </Card>
          {/* Add more summary cards */}
        </div>

        {/* Mobile View */}
        <div className="md:hidden">
          {noWorkDays.map((day) => (
            <NoWorkDayCard key={day.id} day={day} />
          ))}
        </div>

        {/* Desktop View */}
        <NoWorkDayTable />

        {/* Add Dialog */}
        <AddNoWorkDayDialog />
      </CardContent>
    </Card>
  );
}

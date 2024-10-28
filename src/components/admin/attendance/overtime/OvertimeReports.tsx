// components/admin/attendance/overtime/OvertimeReports.tsx

import React, { useState } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { th } from 'date-fns/locale';
import { BarChart3, Download, Filter } from 'lucide-react';

interface OvertimeReport {
  departmentName: string;
  totalHours: number;
  employeeCount: number;
  averageHours: number;
  cost: number;
}

export default function OvertimeReports() {
  const [selectedMonth, setSelectedMonth] = useState<string>(
    format(new Date(), 'yyyy-MM'),
  );
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');

  // Sample data - replace with actual API call
  const reports: OvertimeReport[] = [
    {
      departmentName: 'Production',
      totalHours: 450,
      employeeCount: 25,
      averageHours: 18,
      cost: 67500,
    },
    // Add more sample data...
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500">Total Hours</p>
                <p className="text-2xl font-bold">1,234</p>
              </div>
              <BarChart3 className="text-blue-500" />
            </div>
          </CardContent>
        </Card>
        {/* Add more summary cards */}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Overtime Reports</CardTitle>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>{/* Add month options */}</SelectContent>
            </Select>

            <Select
              value={selectedDepartment}
              onValueChange={setSelectedDepartment}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {/* Add department options */}
              </SelectContent>
            </Select>

            <div className="flex-1">
              <Input placeholder="Search..." />
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Total Hours</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Avg Hours/Employee</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report, index) => (
                <TableRow key={index}>
                  <TableCell>{report.departmentName}</TableCell>
                  <TableCell className="text-right">
                    {report.totalHours}
                  </TableCell>
                  <TableCell className="text-right">
                    {report.employeeCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {report.averageHours}
                  </TableCell>
                  <TableCell className="text-right">
                    ฿{report.cost.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

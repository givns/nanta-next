// components/payroll/AdminDashboard.tsx

import React, { useState, useEffect, FC } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Calendar,
  Clock,
  UserCheck,
  DollarSign,
} from 'lucide-react';
import { AdminPayrollData, PayrollStatus } from '@/types/payroll';
import { User } from '@prisma/client';

interface AdminDashboardProps {
  initialEmployeeId?: string;
  initialPeriod?: {
    startDate: Date;
    endDate: Date;
  };
}

interface Employee
  extends Pick<User, 'employeeId' | 'name' | 'departmentName'> {}

interface Period {
  value: string;
  label: string;
  startDate: Date;
  endDate: Date;
}

const PayrollAdminDashboard: FC<AdminDashboardProps> = ({
  initialEmployeeId,
  initialPeriod,
}) => {
  const [selectedEmployee, setSelectedEmployee] = useState<string>(
    initialEmployeeId || '',
  );
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [payrollData, setPayrollData] = useState<AdminPayrollData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
    generatePayrollPeriods();
  }, []);

  useEffect(() => {
    if (selectedEmployee && currentPeriod) {
      fetchPayrollData();
    }
  }, [selectedEmployee, currentPeriod]);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/admin/checkExistingEmployee');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setError('Failed to load employees');
    }
  };

  const generatePayrollPeriods = () => {
    // Generate last 12 periods
    const currentDate = new Date();
    const periods: Period[] = [];

    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate);
      date.setMonth(date.getMonth() - i);

      const startDate = new Date(date.getFullYear(), date.getMonth(), 26);
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 25);

      periods.push({
        value: format(startDate, 'yyyy-MM'),
        label: `${format(startDate, 'MMM dd', { locale: th })} - ${format(endDate, 'MMM dd', { locale: th })}`,
        startDate,
        endDate,
      });
    }

    setPeriods(periods);
    if (periods.length > 0) {
      setCurrentPeriod(periods[0].value);
    }
  };

  const fetchPayrollData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const period = periods.find((p) => p.value === currentPeriod);
      if (!period) throw new Error('Invalid period');

      const response = await fetch(
        `/api/admin/payroll?employeeId=${selectedEmployee}&periodStart=${period.startDate.toISOString()}&periodEnd=${period.endDate.toISOString()}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch payroll data');
      }

      const data = await response.json();
      setPayrollData(data);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
      setError('Failed to load payroll data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneratePayroll = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const period = periods.find((p) => p.value === currentPeriod);
      if (!period) throw new Error('Invalid period');

      const response = await fetch('/api/admin/calculate-payroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          periodStart: period.startDate.toISOString(),
          periodEnd: period.endDate.toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate payroll');
      }

      await fetchPayrollData();
    } catch (error) {
      console.error('Error generating payroll:', error);
      setError('Failed to generate payroll');
    } finally {
      setIsLoading(false);
    }
  };

  // Main Payroll Overview Section
  const PayrollOverview = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserCheck className="mr-2" />
            Employee Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Name:</span>
              <span className="font-medium">
                {payrollData?.employee?.name || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Department:</span>
              <span className="font-medium">
                {payrollData?.employee?.departmentName || '-'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Position:</span>
              <span className="font-medium">
                {payrollData?.employee?.role || '-'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="mr-2" />
            Period Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-500">Working Days:</span>
              <span className="font-medium">
                {payrollData?.summary?.totalWorkingDays || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Days Present:</span>
              <span className="font-medium">
                {payrollData?.summary?.totalPresent || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Days Absent:</span>
              <span className="font-medium text-red-600">
                {payrollData?.summary?.totalAbsent || 0}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Attendance Details Section
  const AttendanceDetails = () => (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="mr-2" />
          Attendance & Hours
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-500">Regular Hours</h4>
            <p className="text-2xl font-bold">
              {payrollData?.hours?.regularHours || 0}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">
              Overtime Hours
            </h4>
            <p className="text-2xl font-bold">
              {payrollData?.hours?.overtimeHours || 0}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">Holiday Hours</h4>
            <p className="text-2xl font-bold">
              {payrollData?.hours?.holidayHours || 0}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="font-medium mb-2">Late Arrivals & Early Departures</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Total Late Minutes</p>
              <p className="font-medium">
                {payrollData?.attendance?.totalLateMinutes || 0} mins
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Early Departures</p>
              <p className="font-medium">
                {payrollData?.attendance?.earlyDepartures || 0}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Leave & Holiday Section
  const LeaveAndHolidays = () => (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Leave & Holidays</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-500">Sick Leave</h4>
            <p className="text-xl font-bold">
              {payrollData?.leaves?.sick || 0}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">Annual Leave</h4>
            <p className="text-xl font-bold">
              {payrollData?.leaves?.annual || 0}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">
              Business Leave
            </h4>
            <p className="text-xl font-bold">
              {payrollData?.leaves?.business || 0}
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">Holidays</h4>
            <p className="text-xl font-bold">
              {payrollData?.leaves?.holidays || 0}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Payroll Calculation Section
  const PayrollCalculation = () => (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <DollarSign className="mr-2" />
          Payroll Calculation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Base Pay */}
          <div>
            <h4 className="font-medium mb-2">Base Pay</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Regular Hours Rate</p>
                <p className="font-medium">
                  ฿{payrollData?.rates?.regularHourlyRate || 0}/hr
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Base Amount</p>
                <p className="font-medium">
                  ฿{payrollData?.earnings?.baseAmount || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Overtime Pay */}
          <div>
            <h4 className="font-medium mb-2">Overtime Pay</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">OT Rate</p>
                <p className="font-medium">
                  {payrollData?.rates?.overtimeRate || 1.5}x
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">OT Amount</p>
                <p className="font-medium">
                  ฿{payrollData?.earnings?.overtimeAmount || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Allowances */}
          <div>
            <h4 className="font-medium mb-2">Allowances</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Transportation</p>
                <p className="font-medium">
                  ฿{payrollData?.allowances?.transportation || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Meal</p>
                <p className="font-medium">
                  ฿{payrollData?.allowances?.meal || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Housing</p>
                <p className="font-medium">
                  ฿{payrollData?.allowances?.housing || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div>
            <h4 className="font-medium mb-2">Deductions</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Social Security (5%)</p>
                <p className="font-medium text-red-600">
                  -฿{payrollData?.deductions?.socialSecurity || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Tax</p>
                <p className="font-medium text-red-600">
                  -฿{payrollData?.deductions?.tax || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Net Payable */}
          <div className="pt-4 border-t">
            <div className="flex justify-between items-center">
              <h4 className="text-lg font-semibold">Net Payable</h4>
              <p className="text-2xl font-bold text-green-600">
                ฿{payrollData?.netPayable || 0}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Payroll Management</h1>
        <div className="flex space-x-4">
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem
                  key={employee.employeeId}
                  value={employee.employeeId}
                >
                  {employee.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={currentPeriod} onValueChange={setCurrentPeriod}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select Period" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period.value} value={period.value}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleGeneratePayroll}
            disabled={isLoading || !selectedEmployee || !currentPeriod}
          >
            {isLoading ? 'Generating...' : 'Generate Payroll'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {payrollData && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="leaves">Leaves & Holidays</TabsTrigger>
            <TabsTrigger value="calculation">Payroll Calculation</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <PayrollOverview />
          </TabsContent>

          <TabsContent value="attendance">
            <AttendanceDetails />
          </TabsContent>

          <TabsContent value="leaves">
            <LeaveAndHolidays />
          </TabsContent>

          <TabsContent value="calculation">
            <PayrollCalculation />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default PayrollAdminDashboard;

// components/admin/PayrollAdminDashboard.tsx

import { useState, useEffect } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
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

export default function PayrollAdminDashboard() {
  const { user } = useAdmin();
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [payrollData, setPayrollData] = useState<AdminPayrollData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Modified fetch function to include lineUserId
  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/admin/employees', {
        headers: {
          'x-line-userid': user?.lineUserId || '',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch employees');
      const data = await response.json();
      setEmployees(data);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setError('Failed to load employees');
    }
  };

  // Modified fetch payroll data function
  const fetchPayrollData = async () => {
    if (!selectedEmployee || !currentPeriod) return;

    setIsLoading(true);
    setError(null);

    try {
      const period = periods.find((p) => p.value === currentPeriod);
      if (!period) throw new Error('Invalid period');

      const response = await fetch(
        `/api/admin/payroll/payroll?employeeId=${selectedEmployee}&periodStart=${period.startDate.toISOString()}&periodEnd=${period.endDate.toISOString()}`,
        {
          headers: {
            'x-line-userid': user?.lineUserId || '',
          },
        },
      );

      if (!response.ok) throw new Error('Failed to fetch payroll data');
      const data = await response.json();
      setPayrollData(data);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
      setError('Failed to load payroll data');
    } finally {
      setIsLoading(false);
    }
  };

  // Modified generate payroll function
  const handleGeneratePayroll = async () => {
    if (!selectedEmployee || !currentPeriod || !user?.lineUserId) return;

    setIsLoading(true);
    setError(null);

    try {
      const period = periods.find((p) => p.value === currentPeriod);
      if (!period) throw new Error('Invalid period');

      const response = await fetch('/api/admin/payroll/calculate-payroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': user.lineUserId,
        },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          periodStart: period.startDate.toISOString(),
          periodEnd: period.endDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to generate payroll');
      }

      await fetchPayrollData();
    } catch (error) {
      console.error('Error generating payroll:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to generate payroll',
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Modified useEffect
  useEffect(() => {
    if (user?.lineUserId) {
      fetchEmployees();
      generatePayrollPeriods();
    }
  }, [user]);

  useEffect(() => {
    if (selectedEmployee && currentPeriod && user?.lineUserId) {
      fetchPayrollData();
    }
  }, [selectedEmployee, currentPeriod, user?.lineUserId]);

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

  // Mobile controls component
  const MobileControls = () => (
    <div className="space-y-4 md:hidden">
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-2">
          Select Employee
        </label>
        <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select Employee" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((employee) => (
              <SelectItem key={employee.employeeId} value={employee.employeeId}>
                {employee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-500 mb-2">
          Select Period
        </label>
        <Select value={currentPeriod} onValueChange={setCurrentPeriod}>
          <SelectTrigger className="w-full">
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
      </div>

      <Button
        onClick={handleGeneratePayroll}
        disabled={isLoading || !selectedEmployee || !currentPeriod}
        className="w-full"
      >
        {isLoading ? 'Generating...' : 'Generate Payroll'}
      </Button>
    </div>
  );

  // Mobile overview cards
  const MobileOverviewCards = () => (
    <div className="grid grid-cols-1 gap-4 md:hidden">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500">Employee</span>
            <span className="font-medium">
              {payrollData?.employee?.name || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500">Department</span>
            <span className="font-medium">
              {payrollData?.employee?.departmentName || '-'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Period</span>
            <span className="font-medium">
              {currentPeriod
                ? periods.find((p) => p.value === currentPeriod)?.label
                : '-'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500">Net Payable</span>
            <span className="font-bold text-green-600">
              ฿{payrollData?.netPayable || 0}
            </span>
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-500">Regular Hours</span>
            <span className="font-medium">
              {payrollData?.hours?.regularHours || 0}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Overtime Hours</span>
            <span className="font-medium">
              {payrollData?.hours?.overtimeHours || 0}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );

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
    <div className="max-w-7xl mx-auto p-4 md:p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-xl md:text-2xl font-bold">Payroll Management</h1>

        {/* Mobile Controls */}
        <MobileControls />

        {/* Desktop Controls */}
        <div className="hidden md:flex space-x-4">
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
        <>
          {/* Mobile Overview Cards */}
          <MobileOverviewCards />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="leaves">Leaves</TabsTrigger>
              <TabsTrigger value="calculation">Calculation</TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <TabsContent value="overview">
                <div className="hidden md:block">
                  <PayrollOverview />
                </div>
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
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}

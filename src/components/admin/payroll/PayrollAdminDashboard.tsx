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
import { User, EmployeeType } from '@prisma/client';
import { PayrollProcessingResult } from '@/types/payroll/api';

interface ComponentProps {
  payrollData: PayrollProcessingResult;
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
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [currentPeriod, setCurrentPeriod] = useState<string>('');
  const [activeTab, setActiveTab] = useState('overview');
  const [payrollData, setPayrollData] =
    useState<PayrollProcessingResult | null>(null);
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

  const MobileOverviewCards: React.FC<ComponentProps> = ({ payrollData }) => {
    const overtimeBreakdown = {
      workdayOutside: {
        hours: payrollData.hours.workdayOvertimeHours,
        rate: 1.5,
        amount:
          payrollData.hours.workdayOvertimeHours *
          1.5 *
          (payrollData.processedData.basePay / payrollData.hours.regularHours),
      },
      weekendInside: {
        hours: payrollData.hours.weekendShiftOvertimeHours,
        rate:
          payrollData.employee.employeeType === EmployeeType.Fulltime
            ? 1.0
            : 2.0,
        amount:
          payrollData.hours.weekendShiftOvertimeHours *
          (payrollData.employee.employeeType === EmployeeType.Fulltime
            ? 1.0
            : 2.0) *
          (payrollData.processedData.basePay / payrollData.hours.regularHours),
      },
      weekendOutside: {
        hours: payrollData.hours.holidayOvertimeHours,
        rate: 3.0,
        amount:
          payrollData.hours.holidayOvertimeHours *
          3.0 *
          (payrollData.processedData.basePay / payrollData.hours.regularHours),
      },
    };

    const totalOvertimeAmount =
      overtimeBreakdown.workdayOutside.amount +
      overtimeBreakdown.weekendInside.amount +
      overtimeBreakdown.weekendOutside.amount;

    return (
      <div className="grid grid-cols-1 gap-4 md:hidden">
        {/* Employee Info Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold">
                  {payrollData.employee?.name}
                </h2>
                <p className="text-gray-500">
                  {payrollData.employee?.departmentName}
                </p>
                <p className="text-sm text-gray-500">
                  ID: {payrollData.employee?.employeeId}
                </p>
              </div>
              <Badge variant="outline" className="capitalize">
                {payrollData.employee?.employeeType?.toLowerCase()}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Regular Hours Card */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              Regular Hours
            </h3>
            <div className="flex justify-between items-baseline">
              <p className="text-2xl font-bold">
                {payrollData.hours?.regularHours || 0}
              </p>
              <div className="text-right">
                <p className="text-sm text-gray-500">Base Amount</p>
                <p className="text-lg font-medium">
                  ฿{payrollData.processedData.basePay.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overtime Summary Card */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              Overtime Summary
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">
                  Regular OT ({overtimeBreakdown.workdayOutside.rate}x)
                </span>
                <span>{overtimeBreakdown.workdayOutside.hours} hrs</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">
                  Weekend ({overtimeBreakdown.weekendInside.rate}x)
                </span>
                <span>{overtimeBreakdown.weekendInside.hours} hrs</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">
                  Holiday ({overtimeBreakdown.weekendOutside.rate}x)
                </span>
                <span>{overtimeBreakdown.weekendOutside.hours} hrs</span>
              </div>
              <div className="pt-2 border-t flex justify-between items-center font-medium">
                <span>Total</span>
                <span>฿{totalOvertimeAmount.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net Payable Card */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">
              Net Payable
            </h3>
            <div className="flex justify-between items-baseline">
              <div className="space-y-1">
                <p className="text-sm text-gray-500">Total Deductions</p>
                <p className="text-red-600">
                  -฿
                  {payrollData.processedData.deductions.total.toLocaleString()}
                </p>
              </div>
              <p className="text-2xl font-bold text-green-600">
                ฿{payrollData.processedData.netPayable.toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Main Payroll Overview Section
  const PayrollOverview: React.FC<ComponentProps> = ({ payrollData }) => (
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
              <span className="font-medium">{payrollData.employee.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Department:</span>
              <span className="font-medium">
                {payrollData.employee.departmentName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Position:</span>
              <span className="font-medium">{payrollData.employee.role}</span>
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
                {payrollData.summary.totalWorkingDays}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Days Present:</span>
              <span className="font-medium">
                {payrollData.summary.totalPresent}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Days Absent:</span>
              <span className="font-medium text-red-600">
                {payrollData.summary.totalAbsent}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // Attendance Details Section
  const AttendanceDetails: React.FC<{
    payrollData: PayrollProcessingResult;
  }> = ({ payrollData }) => {
    // Extract detailed overtime information
    const overtimeBreakdown = {
      workdayOutside: {
        hours: payrollData.hours?.workdayOvertimeHours || 0,
        rate: 1.5, // From settings
        amount:
          (payrollData.hours?.workdayOvertimeHours || 0) *
          1.5 *
          (payrollData.processedData.basePay / payrollData.hours.regularHours),
      },
      weekendInside: {
        hours: payrollData.hours?.weekendShiftOvertimeHours || 0,
        rate: payrollData.employee?.employeeType === 'Fulltime' ? 1.0 : 2.0,
        amount:
          (payrollData.hours?.weekendShiftOvertimeHours || 0) *
          (payrollData.employee?.employeeType === 'Fulltime' ? 1.0 : 2.0) *
          (payrollData.processedData.basePay / payrollData.hours.regularHours),
      },
      weekendOutside: {
        hours: payrollData.hours?.holidayOvertimeHours || 0, // Using holidayOvertimeHours for outside shift weekend hours
        rate: 3.0,
        amount:
          (payrollData.hours?.holidayOvertimeHours || 0) *
          3.0 *
          (payrollData.processedData.basePay / payrollData.hours.regularHours),
      },
    };

    const totalOvertimeHours =
      overtimeBreakdown.workdayOutside.hours +
      overtimeBreakdown.weekendInside.hours +
      overtimeBreakdown.weekendOutside.hours;

    const totalOvertimeAmount =
      overtimeBreakdown.workdayOutside.amount +
      overtimeBreakdown.weekendInside.amount +
      overtimeBreakdown.weekendOutside.amount;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="mr-2" />
            Attendance & Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Regular Hours Section */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-medium text-gray-500">
                  Regular Hours
                </h4>
                <p className="text-2xl font-bold">
                  {payrollData.hours.regularHours}
                </p>
                <p className="text-sm text-gray-500">
                  Base Rate: ฿
                  {(
                    payrollData.processedData.basePay /
                    payrollData.hours.regularHours
                  ).toFixed(2)}
                  /hr
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">
                  Base Amount
                </h4>
                <p className="text-2xl font-bold">
                  ฿{payrollData.processedData.basePay.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Overtime Breakdown */}
            <div className="space-y-4">
              <h4 className="font-medium">Overtime Breakdown</h4>

              {/* Workday Overtime */}
              <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg">
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">
                    Workday (Outside Shift)
                  </p>
                  <p className="font-medium">
                    {overtimeBreakdown.workdayOutside.hours} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Rate</p>
                  <p className="font-medium">
                    {overtimeBreakdown.workdayOutside.rate}x
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="font-medium">
                    ฿{overtimeBreakdown.workdayOutside.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Weekend Inside Shift */}
              <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg">
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">
                    Weekend (Regular Hours)
                  </p>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendInside.hours} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Rate</p>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendInside.rate}x
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="font-medium">
                    ฿{overtimeBreakdown.weekendInside.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Weekend Outside Shift */}
              <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg">
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">
                    Weekend (Outside Hours)
                  </p>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendOutside.hours} hrs
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Rate</p>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendOutside.rate}x
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Amount</p>
                  <p className="font-medium">
                    ฿{overtimeBreakdown.weekendOutside.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Total Overtime */}
              <div className="grid grid-cols-4 gap-2 border-t pt-4 mt-4">
                <div className="col-span-2">
                  <p className="font-medium">Total Overtime</p>
                  <p className="text-xl font-bold">{totalOvertimeHours} hrs</p>
                </div>
                <div className="col-span-2 text-right">
                  <p className="font-medium">Total Amount</p>
                  <p className="text-xl font-bold text-green-600">
                    ฿{totalOvertimeAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Late Minutes & Early Departures */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <h4 className="text-sm font-medium text-gray-500">
                  Late Minutes
                </h4>
                <p className="text-lg font-medium">
                  {payrollData.attendance.totalLateMinutes || 0} mins
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">
                  Early Departures
                </h4>
                <p className="text-lg font-medium">
                  {payrollData.attendance.earlyDepartures || 0} mins
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Leave & Holiday Section
  const LeaveAndHolidays: React.FC<ComponentProps> = ({ payrollData }) => (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Leave & Holidays</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <h4 className="text-sm font-medium text-gray-500">Sick Leave</h4>
            <p className="text-xl font-bold">{payrollData.leaves.sick}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">Annual Leave</h4>
            <p className="text-xl font-bold">{payrollData.leaves.annual}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">
              Business Leave
            </h4>
            <p className="text-xl font-bold">{payrollData.leaves.business}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-500">Unpaid</h4>
            <p className="text-xl font-bold">{payrollData.leaves.unpaid}</p>
          </div>

          <div>
            <h4 className="text-sm font-medium text-gray-500">Holidays</h4>
            <p className="text-xl font-bold">{payrollData.leaves.holidays}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Payroll Calculation Section
  const PayrollCalculation: React.FC<ComponentProps> = ({ payrollData }) => (
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
                  ฿{payrollData?.processedData?.basePay || 0}
                </p>
              </div>
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
                ฿{payrollData?.processedData?.overtimePay || 0}
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
                ฿{payrollData?.processedData.allowances?.transportation || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Meal</p>
              <p className="font-medium">
                ฿{payrollData?.processedData.allowances?.meal || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Housing</p>
              <p className="font-medium">
                ฿{payrollData?.processedData.allowances?.housing || 0}
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
                -฿{payrollData?.processedData.deductions?.socialSecurity || 0}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">unpaid Leave</p>
                <p className="font-medium text-red-600">
                  -฿{payrollData?.processedData.deductions?.unpaidLeave || 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Tax</p>
                <p className="font-medium text-red-600">
                  -฿{payrollData?.processedData.deductions?.tax || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Net Payable */}
          <div className="pt-4 border-t">
            <div className="flex justify-between items-center">
              <h4 className="text-lg font-semibold">Net Payable</h4>
              <p className="text-2xl font-bold text-green-600">
                ฿{payrollData?.processedData.netPayable || 0}
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
          <MobileOverviewCards payrollData={payrollData} />
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
            <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full">
              {/* ... tab triggers */}
            </TabsList>

            <div className="mt-4">
              <TabsContent value="overview">
                <div className="hidden md:block">
                  <PayrollOverview payrollData={payrollData} />
                </div>
              </TabsContent>

              <TabsContent value="attendance">
                <AttendanceDetails payrollData={payrollData} />
              </TabsContent>

              <TabsContent value="leaves">
                <LeaveAndHolidays payrollData={payrollData} />
              </TabsContent>

              <TabsContent value="calculation">
                <PayrollCalculation payrollData={payrollData} />
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}

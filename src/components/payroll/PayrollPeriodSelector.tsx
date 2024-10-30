//PayrollPeriodSelector.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  format,
  parse,
  addMonths,
  subMonths,
  setDate,
  isSameMonth,
} from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type {
  PayrollSummaryResponse,
  PayrollPeriodResponse,
  PayrollSettings,
  EmployeePayrollSummary,
  PayrollProcessingResult,
} from '@/types/payroll/api';
import { EmployeeType } from '@prisma/client';

// Custom type for payroll period
interface PayrollPeriodInfo {
  startDate: Date;
  endDate: Date;
  displayName: string;
  isPending: boolean;
}

// Utility functions for payroll period calculations
const getPayrollPeriodDates = (date: Date): { start: Date; end: Date } => {
  const year = date.getFullYear();
  const month = date.getMonth();

  // For any given month, the period:
  // - Starts on the 26th of the previous month
  // - Ends on the 25th of the current month
  const startDate = setDate(subMonths(date, 1), 26);
  const endDate = setDate(date, 25);

  return { start: startDate, end: endDate };
};

const getPayrollPeriodDisplayName = (date: Date): string => {
  const { start, end } = getPayrollPeriodDates(date);
  return `${format(start, 'MMM dd', { locale: th })} - ${format(end, 'MMM dd, yyyy', { locale: th })}`;
};

// Component for managing payroll periods
const PayrollPeriodSelector: React.FC<{
  currentValue: string;
  onChange: (value: string) => void;
  periods: PayrollPeriodResponse;
}> = ({ currentValue, onChange, periods }) => {
  const availablePeriods = useMemo(() => {
    // Get last 12 periods including current
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(now, i);
      const { start, end } = getPayrollPeriodDates(date);
      const displayName = getPayrollPeriodDisplayName(date);
      const isPending = i === 0;

      return {
        startDate: start,
        endDate: end,
        displayName,
        isPending,
        value: format(date, 'yyyy-MM'),
      };
    });
  }, []);

  return (
    <div className="flex items-center space-x-2">
      <Select value={currentValue} onValueChange={onChange}>
        <SelectTrigger className="w-[240px]">
          <CalendarIcon className="mr-2 h-4 w-4" />
          <SelectValue placeholder="Select period" />
        </SelectTrigger>
        <SelectContent>
          {availablePeriods.map((period) => (
            <SelectItem key={period.value} value={period.value}>
              <div className="flex items-center justify-between w-full">
                <span>{period.displayName}</span>
                {period.isPending && (
                  <Badge variant="secondary" className="ml-2">
                    Current
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// Enhanced PayrollSummary component with detailed breakdown
const DetailedPayrollSummary: React.FC<{
  payrollData: PayrollProcessingResult;
  settings: PayrollSettings;
}> = ({ payrollData, settings }) => {
  const overtimeBreakdown = {
    workdayOutside: {
      hours: payrollData.hours.workdayOvertimeHours,
      rate: settings.overtimeRates[payrollData.employee.employeeType]
        .workdayOutsideShift,
      amount:
        payrollData.hours.workdayOvertimeHours *
        settings.overtimeRates[payrollData.employee.employeeType]
          .workdayOutsideShift *
        payrollData.rates.regularHourlyRate,
    },
    weekendInside: {
      hours: payrollData.hours.weekendShiftOvertimeHours,
      rate:
        payrollData.employee.employeeType === EmployeeType.Fulltime
          ? settings.overtimeRates[payrollData.employee.employeeType]
              .weekendInsideShiftFulltime
          : settings.overtimeRates[payrollData.employee.employeeType]
              .weekendInsideShiftParttime,
      amount:
        payrollData.hours.weekendShiftOvertimeHours *
        (payrollData.employee.employeeType === EmployeeType.Fulltime
          ? settings.overtimeRates[payrollData.employee.employeeType]
              .weekendInsideShiftFulltime
          : settings.overtimeRates[payrollData.employee.employeeType]
              .weekendInsideShiftParttime) *
        payrollData.rates.regularHourlyRate,
    },
    weekendOutside: {
      hours: payrollData.hours.holidayOvertimeHours,
      rate: settings.overtimeRates[payrollData.employee.employeeType]
        .weekendOutsideShift,
      amount:
        payrollData.hours.holidayOvertimeHours *
        settings.overtimeRates[payrollData.employee.employeeType]
          .weekendOutsideShift *
        payrollData.rates.regularHourlyRate,
    },
  };

  return (
    <div className="space-y-6">
      {/* Hours Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Working Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4">
            {/* Regular Hours */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Regular Hours</span>
                <span className="font-medium">
                  {payrollData.hours.regularHours}
                </span>
              </div>
              <div className="text-sm text-gray-500">
                Rate: ฿{payrollData.rates.regularHourlyRate}/hr
                <br />
                Amount: ฿{payrollData.processedData.basePay.toLocaleString()}
              </div>
            </div>

            {/* Overtime Breakdown */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="font-medium">Overtime Breakdown</h4>

              {/* Workday Outside Shift */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-sm text-gray-600">Regular OT</span>
                  <p className="font-medium">
                    {overtimeBreakdown.workdayOutside.hours}hrs
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Rate</span>
                  <p className="font-medium">
                    {overtimeBreakdown.workdayOutside.rate}x
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-600">Amount</span>
                  <p className="font-medium">
                    ฿{overtimeBreakdown.workdayOutside.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Weekend Inside Shift */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-sm text-gray-600">
                    Weekend (Regular)
                  </span>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendInside.hours}hrs
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Rate</span>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendInside.rate}x
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-600">Amount</span>
                  <p className="font-medium">
                    ฿{overtimeBreakdown.weekendInside.amount.toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Weekend Outside Shift */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <span className="text-sm text-gray-600">
                    Weekend (Outside)
                  </span>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendOutside.hours}hrs
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Rate</span>
                  <p className="font-medium">
                    {overtimeBreakdown.weekendOutside.rate}x
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-600">Amount</span>
                  <p className="font-medium">
                    ฿{overtimeBreakdown.weekendOutside.amount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Allowances & Deductions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Earnings Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Allowances */}
            <div>
              <h4 className="font-medium mb-2">Allowances</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Transportation</span>
                  <span>
                    ฿
                    {payrollData.processedData.allowances.transportation.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Meal</span>
                  <span>
                    ฿
                    {payrollData.processedData.allowances.meal.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Housing</span>
                  <span>
                    ฿
                    {payrollData.processedData.allowances.housing.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="pt-4 border-t">
              <h4 className="font-medium mb-2">Deductions</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-red-600">
                  <span>Social Security</span>
                  <span>
                    -฿
                    {payrollData.processedData.deductions.socialSecurity.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Tax</span>
                  <span>
                    -฿
                    {payrollData.processedData.deductions.tax.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Unpaid Leave</span>
                  <span>
                    -฿
                    {payrollData.processedData.deductions.unpaidLeave.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between font-medium text-red-600 pt-2 border-t">
                  <span>Total Deductions</span>
                  <span>
                    -฿
                    {payrollData.processedData.deductions.total.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Net Payable */}
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Net Payable</span>
                <span className="font-bold text-lg text-green-600">
                  ฿{payrollData.processedData.netPayable.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Main container component
const PayrollContainer: React.FC<{
  employeeId: string;
}> = ({ employeeId }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [payrollData, setPayrollData] =
    useState<PayrollProcessingResult | null>(null);
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayrollData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [periodsRes, settingsRes] = await Promise.all([
          fetch(`/api/payroll/periods?employeeId=${employeeId}`),
          fetch(`/api/payroll/settings?employeeId=${employeeId}`),
        ]);

        const [periodsData, settingsData] = await Promise.all([
          periodsRes.json(),
          settingsRes.json(),
        ]);

        setSettings(settingsData);

        // Set current period
        const currentDate = new Date();
        const currentPeriod = format(currentDate, 'yyyy-MM');
        setSelectedPeriod(currentPeriod);

        // Fetch initial payroll data
        const { start, end } = getPayrollPeriodDates(currentDate);
        const payrollRes = await fetch(
          `/api/payroll/summary?employeeId=${employeeId}&periodStart=${start.toISOString()}&periodEnd=${end.toISOString()}`,
        );
        const payrollData = await payrollRes.json();
        setPayrollData(payrollData);
      } catch (err) {
        setError('Failed to load payroll data');
        console.error('Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayrollData();
  }, [employeeId]);

  const handlePeriodChange = async (period: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const periodDate = parse(period, 'yyyy-MM', new Date());
      const { start, end } = getPayrollPeriodDates(periodDate);

      const response = await fetch(
        `/api/payroll/summary?employeeId=${employeeId}&periodStart=${start.toISOString()}&periodEnd=${end.toISOString()}`,
      );
      const data = await response.json();
      setPayrollData(data);
      setSelectedPeriod(period);
    } catch (err) {
      setError('Failed to load payroll data for selected period');
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Loading payroll data...</div>;
  }

  if (error || !settings || !payrollData) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error || 'Failed to load payroll data'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <PayrollPeriodSelector
        currentValue={selectedPeriod}
        onChange={handlePeriodChange}
        periods={{
          periods: [], // This would come from your API
          currentPeriod: {
            startDate: new Date().toISOString(),
            endDate: new Date().toISOString(),
          },
        }}
      />
      <DetailedPayrollSummary payrollData={payrollData} settings={settings} />
    </div>
  );
};

export default PayrollContainer;

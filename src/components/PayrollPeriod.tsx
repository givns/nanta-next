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
} from '@/types/api';

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
  const { totalRegularHours, totalOvertimeHours, processedData } = payrollData;

  const calculateRate = (hours: number, rate: number): string =>
    `฿${(hours * rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* Hours Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Working Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Regular Hours</span>
                <span className="font-medium">{totalRegularHours}</span>
              </div>
              <div className="text-sm text-gray-500">
                Rate: ฿{settings.regularHourlyRate}/hr
                <br />
                Total:{' '}
                {calculateRate(totalRegularHours, settings.regularHourlyRate)}
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Overtime Hours</span>
                <span className="font-medium">{totalOvertimeHours}</span>
              </div>
              <div className="text-sm text-gray-500">
                Rate: ฿
                {settings.regularHourlyRate * settings.overtimeRates.regular}/hr
                <br />
                Total:{' '}
                {calculateRate(
                  totalOvertimeHours,
                  settings.regularHourlyRate * settings.overtimeRates.regular,
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Earnings Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Base Pay */}
            <div className="flex justify-between">
              <span className="text-gray-600">Base Pay</span>
              <span className="font-medium">
                ฿{processedData.basePay.toLocaleString()}
              </span>
            </div>

            {/* Overtime Pay */}
            <div className="flex justify-between">
              <span className="text-gray-600">Overtime Pay</span>
              <span className="font-medium">
                ฿{processedData.overtimePay.toLocaleString()}
              </span>
            </div>

            {/* Holiday Pay */}
            <div className="flex justify-between">
              <span className="text-gray-600">Holiday Pay</span>
              <span className="font-medium">
                ฿{processedData.holidayPay.toLocaleString()}
              </span>
            </div>

            {/* Allowances */}
            <div className="pt-3 border-t">
              <div className="space-y-2">
                <div className="flex justify-between text-gray-600">
                  <span>Transportation Allowance</span>
                  <span>
                    ฿{settings.allowances.transportation.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Meal Allowance</span>
                  <span>฿{settings.allowances.meal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Housing Allowance</span>
                  <span>฿{settings.allowances.housing.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="pt-3 border-t">
              <div className="space-y-2">
                <div className="flex justify-between text-red-600">
                  <span>Social Security (5%)</span>
                  <span>
                    -฿{processedData.deductions.socialSecurity.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Tax</span>
                  <span>-฿{processedData.deductions.tax.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Net Payable */}
            <div className="pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Net Payable</span>
                <span className="font-bold text-lg text-green-600">
                  ฿{processedData.netPayable.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Status */}
      {payrollData.processedData.adjustments.length > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This payroll includes {payrollData.processedData.adjustments.length}{' '}
            adjustment(s). Check with HR for details.
          </AlertDescription>
        </Alert>
      )}
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

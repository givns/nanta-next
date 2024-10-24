import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { format, endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import { PayrollSummaryResponse } from '@/types/api';

interface PayrollContainerProps {
  employeeId: string;
}

export const PayrollContainer: React.FC<PayrollContainerProps> = ({
  employeeId,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    format(new Date(), 'yyyy-MM'),
  );
  const [payrollData, setPayrollData] = useState<PayrollSummaryResponse | null>(
    null,
  );
  const [availablePeriods, setAvailablePeriods] = useState<string[]>([]);

  useEffect(() => {
    // Generate last 12 periods
    const periods = Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(new Date(), i);
      return format(date, 'yyyy-MM');
    });
    setAvailablePeriods(periods);

    fetchPayrollData(selectedPeriod);
  }, [employeeId]);

  useEffect(() => {
    fetchPayrollData(selectedPeriod);
  }, [selectedPeriod]);

  const fetchPayrollData = async (period: string) => {
    setIsLoading(true);
    try {
      const [year, month] = period.split('-').map(Number);
      const startDate = startOfMonth(new Date(year, month - 1));
      const endDate = endOfMonth(new Date(year, month - 1));

      const response = await fetch(
        `/api/payroll/summary?employeeId=${employeeId}&periodStart=${startDate.toISOString()}&periodEnd=${endDate.toISOString()}`,
      );

      if (response.ok) {
        const data = await response.json();
        setPayrollData(data);
      }
    } catch (error) {
      console.error('Error fetching payroll data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const PayrollSkeleton = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-10 w-[200px]" />
      </div>

      {/* Earnings Overview Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>
          <div className="mt-6 pt-4 border-t">
            <div className="flex justify-between items-center">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-8 w-36" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Summary Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leave Summary Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i}>
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (isLoading) {
    return <PayrollSkeleton />;
  }

  if (!payrollData) {
    return (
      <Card>
        <CardContent>No payroll data available.</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {availablePeriods.map((period) => (
              <SelectItem key={period} value={period}>
                {format(new Date(period), 'MMMM yyyy', { locale: th })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Earnings Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Earnings Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Base Pay</p>
              <p className="text-lg font-semibold">
                ฿{payrollData.earnings.basePay.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Overtime Pay</p>
              <p className="text-lg font-semibold">
                ฿{payrollData.earnings.overtimePay.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Allowances</p>
              <p className="text-lg font-semibold">
                ฿{payrollData.earnings.allowances.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Deductions</p>
              <p className="text-lg font-semibold text-red-600">
                -฿{payrollData.earnings.totalDeductions.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t">
            <div className="flex justify-between items-center">
              <p className="text-lg font-semibold">Net Pay</p>
              <p className="text-2xl font-bold text-green-600">
                ฿{payrollData.earnings.netPayable.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Attendance Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Working Days</p>
              <p className="text-lg font-semibold">
                {payrollData.totalWorkDays}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Days Present</p>
              <p className="text-lg font-semibold">{payrollData.daysPresent}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Days Absent</p>
              <p className="text-lg font-semibold">{payrollData.daysAbsent}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Regular Hours</p>
              <p className="text-lg font-semibold">
                {payrollData.regularHours}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Overtime Hours</p>
              <p className="text-lg font-semibold">
                {payrollData.overtimeHours}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Holidays</p>
              <p className="text-lg font-semibold">{payrollData.holidays}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Leave Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Sick Leave</p>
              <p className="text-lg font-semibold">{payrollData.leaves.sick}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Annual Leave</p>
              <p className="text-lg font-semibold">
                {payrollData.leaves.annual}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Business Leave</p>
              <p className="text-lg font-semibold">
                {payrollData.leaves.business}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Unpaid Leave</p>
              <p className="text-lg font-semibold text-red-600">
                {payrollData.leaves.unpaid}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deductions Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Deductions Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Social Security */}
            <div className="flex justify-between items-center py-2 border-b">
              <div>
                <p className="font-medium">Social Security</p>
                <p className="text-sm text-gray-500">
                  5% of eligible earnings (max ฿750)
                </p>
              </div>
              <p className="text-red-600 font-medium">
                -฿
                {payrollData.earnings.deductions.socialSecurity.toLocaleString()}
              </p>
            </div>
            {/* Tax */}
            <div className="flex justify-between items-center py-2 border-b">
              <div>
                <p className="font-medium">Tax</p>
                <p className="text-sm text-gray-500">
                  Progressive rate based on income
                </p>
              </div>
              <p className="text-red-600 font-medium">
                -฿{payrollData.earnings.deductions.tax.toLocaleString()}
              </p>
            </div>
            {/* Total Deductions */}
            <div className="flex justify-between items-center pt-4 font-bold">
              <p>Total Deductions</p>
              <p className="text-red-600">
                -฿{payrollData.earnings.totalDeductions.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between">
              <p className="text-gray-500">Payment Date</p>
              <p className="font-medium">
                {format(endOfMonth(new Date(selectedPeriod)), 'dd MMMM yyyy', {
                  locale: th,
                })}
              </p>
            </div>
            <div className="flex justify-between">
              <p className="text-gray-500">Payment Method</p>
              <p className="font-medium">Bank Transfer</p>
            </div>
            {payrollData.bankInfo && (
              <div className="flex justify-between">
                <p className="text-gray-500">Bank Account</p>
                <p className="font-medium">
                  {payrollData.bankInfo.bankName} -{' '}
                  {payrollData.bankInfo.accountNumber}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

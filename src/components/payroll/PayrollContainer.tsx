// components/payroll/PayrollContainer.tsx
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
import { format, subMonths, addMonths } from 'date-fns';
import { th } from 'date-fns/locale';
import { PayrollSummaryResponse } from '@/types/api';
import { PayrollPeriodDisplay } from '@/types/payroll';

interface PayrollContainerProps {
  employeeId: string;
  initialPeriod?: PayrollPeriodDisplay;
}

const getPayrollPeriod = (date: Date = new Date()) => {
  const day = date.getDate();
  let periodStart: Date;
  let periodEnd: Date;

  if (day <= 25) {
    // Current period is previous month 26th to current month 25th
    periodStart = new Date(date.getFullYear(), date.getMonth() - 1, 26);
    periodEnd = new Date(date.getFullYear(), date.getMonth(), 25);
  } else {
    // Current period is current month 26th to next month 25th
    periodStart = new Date(date.getFullYear(), date.getMonth(), 26);
    periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 25);
  }

  return {
    periodStart,
    periodEnd,
    displayMonth: format(periodStart, 'yyyy-MM'),
    periodLabel: `${format(periodStart, 'd MMMM', { locale: th })} - ${format(periodEnd, 'd MMMM yyyy', { locale: th })}`,
  };
};

const formatCurrency = (amount: number) =>
  `฿${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;

export const PayrollContainer: React.FC<PayrollContainerProps> = ({
  employeeId,
  initialPeriod,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [payrollData, setPayrollData] = useState<PayrollSummaryResponse | null>(
    null,
  );
  const [availablePeriods, setAvailablePeriods] = useState<
    Array<{
      value: string;
      label: string;
      start: Date;
      end: Date;
    }>
  >([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    if (initialPeriod) {
      return format(new Date(initialPeriod.startDate), 'yyyy-MM');
    }
    return getPayrollPeriod().displayMonth;
  });

  useEffect(() => {
    // Generate last 12 payroll periods
    const periods = Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(new Date(), i);
      const period = getPayrollPeriod(date);
      return {
        value: period.displayMonth,
        label: period.periodLabel,
        start: period.periodStart,
        end: period.periodEnd,
      };
    });
    setAvailablePeriods(periods);

    // Fetch initial data
    if (initialPeriod) {
      fetchPayrollData(format(new Date(initialPeriod.startDate), 'yyyy-MM'));
    } else {
      fetchPayrollData(selectedPeriod);
    }
  }, [employeeId, initialPeriod]);

  const fetchPayrollData = async (periodYearMonth: string) => {
    setIsLoading(true);
    try {
      const period = availablePeriods.find((p) => p.value === periodYearMonth);
      if (!period) return;

      const response = await fetch(
        `/api/payroll/summary?employeeId=${employeeId}&startDate=${period.start.toISOString()}&endDate=${period.end.toISOString()}`,
      );

      if (!response.ok) throw new Error('Failed to fetch payroll data');

      const data = await response.json();
      // Here you'll get the full PayrollPeriod data from the API
      setPayrollData(data);
    } catch (error) {
      console.error('Error fetching payroll data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Use initialPeriod for initial render if provided
  useEffect(() => {
    if (initialPeriod) {
      const periodYearMonth = format(initialPeriod.startDate, 'yyyy-MM');
      fetchPayrollData(periodYearMonth);
    }
  }, [initialPeriod?.startDate.toISOString()]);

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    fetchPayrollData(period);
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
      {/* 1. Period Selector */}
      <div className="flex justify-between items-center">
        <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
          <SelectTrigger className="w-[300px]">
            <SelectValue placeholder="เลือกรอบเงินเดือน" />
          </SelectTrigger>
          <SelectContent>
            {availablePeriods.map((period) => (
              <SelectItem key={period.value} value={period.value}>
                {/* Shows: "26 มกราคม - 25 กุมภาพันธ์ 2567" */}
                {period.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 2. Conditional Rendering Based on State */}
      {isLoading ? (
        // Show loading skeleton
        <PayrollSkeleton />
      ) : !payrollData ? (
        // Show empty state
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-gray-500">
              ไม่พบข้อมูลเงินเดือนสำหรับรอบที่เลือก
            </p>
          </CardContent>
        </Card>
      ) : (
        // Main content when data is available
        <>
          {/* 3. Employee Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลพนักงาน</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">ชื่อ-นามสกุล</p>
                  <p className="text-lg font-semibold">
                    {payrollData.employeeName}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">แผนก</p>
                  <p className="text-lg font-semibold">
                    {payrollData.departmentName}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 4. Earnings Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>สรุปรายได้</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {/* Base Pay */}
                <div>
                  <p className="text-sm text-gray-500">เงินเดือนพื้นฐาน</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(payrollData.earnings.basePay)}
                  </p>
                </div>
                {/* Overtime Pay */}
                <div>
                  <p className="text-sm text-gray-500">ค่าล่วงเวลา</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(payrollData.earnings.overtimePay)}
                  </p>
                </div>
                {/* Holiday Pay */}
                <div>
                  <p className="text-sm text-gray-500">ค่าทำงานวันหยุด</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(payrollData.earnings.holidayPay)}
                  </p>
                </div>
                {/* Allowances */}
                <div>
                  <p className="text-sm text-gray-500">เงินเพิ่มพิเศษ</p>
                  <p className="text-lg font-semibold">
                    {formatCurrency(payrollData.earnings.allowances)}
                  </p>
                </div>
              </div>
              {/* Net Total */}
              <div className="mt-6 pt-4 border-t">
                <div className="flex justify-between items-center">
                  <p className="text-lg font-semibold">รายได้สุทธิ</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(payrollData.earnings.netPayable)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 5. Attendance Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>สรุปการทำงาน</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">วันทำงานทั้งหมด</p>
                  <p className="text-lg font-semibold">
                    {payrollData.totalWorkDays} วัน
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">วันที่มาทำงาน</p>
                  <p className="text-lg font-semibold">
                    {payrollData.daysPresent} วัน
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">วันหยุด</p>
                  <p className="text-lg font-semibold">
                    {payrollData.holidays} วัน
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ชั่วโมงทำงานปกติ</p>
                  <p className="text-lg font-semibold">
                    {payrollData.regularHours} ชม.
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ชั่วโมงทำงานล่วงเวลา</p>
                  <p className="text-lg font-semibold">
                    {payrollData.overtimeHours} ชม.
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">วันขาดงาน</p>
                  <p className="text-lg font-semibold text-red-600">
                    {payrollData.daysAbsent} วัน
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 6. Leave Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>สรุปการลา</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">ลาป่วย</p>
                  <p className="text-lg font-semibold">
                    {payrollData.leaves.sick} วัน
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ลาพักร้อน</p>
                  <p className="text-lg font-semibold">
                    {payrollData.leaves.annual} วัน
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ลากิจ</p>
                  <p className="text-lg font-semibold">
                    {payrollData.leaves.business} วัน
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ลาไม่รับค่าจ้าง</p>
                  <p className="text-lg font-semibold text-red-600">
                    {payrollData.leaves.unpaid} วัน
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 7. Payment Details Card */}
          {payrollData.bankInfo && (
            <Card>
              <CardHeader>
                <CardTitle>รายละเอียดการจ่ายเงิน</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <p className="text-gray-500">วันที่จ่ายเงิน</p>
                    <p className="font-medium">
                      {format(new Date(payrollData.periodEnd), 'd MMMM yyyy', {
                        locale: th,
                      })}
                    </p>
                  </div>
                  <div className="flex justify-between">
                    <p className="text-gray-500">ธนาคาร</p>
                    <p className="font-medium">
                      {payrollData.bankInfo.bankName}
                    </p>
                  </div>
                  <div className="flex justify-between">
                    <p className="text-gray-500">เลขที่บัญชี</p>
                    <p className="font-medium">
                      {payrollData.bankInfo.accountNumber}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

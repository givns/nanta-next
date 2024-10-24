// components/payroll/PayrollDisplay.tsx
import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { PayrollSummaryResponse } from '@/types/api';

interface PayrollDisplayProps {
  data: PayrollSummaryResponse;
}

export const PayrollDisplay: React.FC<PayrollDisplayProps> = ({ data }) => {
  return (
    <div className="space-y-6">
      {/* Period Information */}
      <Card>
        <CardHeader>
          <CardTitle>
            Payroll Period:{' '}
            {format(new Date(data.periodStart), 'MMM dd', { locale: th })} -{' '}
            {format(new Date(data.periodEnd), 'MMM dd, yyyy', { locale: th })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Working Days</p>
              <p className="text-lg font-semibold">{data.totalWorkDays}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Days Present</p>
              <p className="text-lg font-semibold">{data.daysPresent}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Earnings Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span>Base Pay</span>
              <span className="font-semibold">
                ฿{data.earnings.basePay.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Overtime Pay</span>
              <span className="font-semibold">
                ฿{data.earnings.overtimePay.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Allowances</span>
              <span className="font-semibold">
                ฿{data.earnings.allowances.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Deductions</span>
              <span className="font-semibold">
                -฿{data.earnings.totalDeductions.toLocaleString()}
              </span>
            </div>
            <div className="pt-4 border-t flex justify-between">
              <span className="font-bold">Net Payable</span>
              <span className="font-bold text-green-600">
                ฿{data.earnings.netPayable.toLocaleString()}
              </span>
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Sick Leave</p>
              <p className="text-lg">{data.leaves.sick} days</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Annual Leave</p>
              <p className="text-lg">{data.leaves.annual} days</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

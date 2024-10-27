// components/payroll/PayrollSummary.tsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Clock, Calendar, Briefcase } from 'lucide-react';
import { PayrollSummaryResponse } from '@/types/payroll';

interface PayrollSummaryProps {
  data: PayrollSummaryResponse;
}

export const PayrollSummary: React.FC<PayrollSummaryProps> = ({ data }) => {
  return (
    <div className="space-y-6">
      {/* Period Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="mr-2" />
            Payroll Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Start Date</p>
              <p className="font-medium">
                {format(new Date(data.periodStart), 'dd MMMM yyyy', {
                  locale: th,
                })}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">End Date</p>
              <p className="font-medium">
                {format(new Date(data.periodEnd), 'dd MMMM yyyy', {
                  locale: th,
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Work Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="mr-2" />
            Work Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Working Days</p>
              <p className="text-xl font-semibold">{data.totalWorkDays}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Days Present</p>
              <p className="text-xl font-semibold">{data.daysPresent}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Regular Hours</p>
              <p className="text-xl font-semibold">{data.regularHours}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Overtime Hours</p>
              <p className="text-xl font-semibold">{data.overtimeHours}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Leave Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Briefcase className="mr-2" />
            Leave Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Sick Leave</p>
              <p className="text-xl font-semibold">{data.leaves.sick}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Annual Leave</p>
              <p className="text-xl font-semibold">{data.leaves.annual}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Business Leave</p>
              <p className="text-xl font-semibold">{data.leaves.business}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Unpaid Leave</p>
              <p className="text-xl font-semibold text-red-500">
                {data.leaves.unpaid}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Earnings Summary</CardTitle>
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
              <span>Holiday Pay</span>
              <span className="font-semibold">
                ฿{data.earnings.holidayPay.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Allowances</span>
              <span className="font-semibold">
                ฿{data.earnings.allowances.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Total Deductions</span>
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

      {/* Bank Info */}
      {data.bankInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Payment Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Bank</span>
                <span className="font-medium">{data.bankInfo.bankName}</span>
              </div>
              <div className="flex justify-between">
                <span>Account Number</span>
                <span className="font-medium">
                  {data.bankInfo.accountNumber}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

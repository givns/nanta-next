import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Clock,
  Calendar,
  Wallet,
  AlertCircle,
  Briefcase,
  UserCheck,
  FileSpreadsheet,
} from 'lucide-react';

interface PayrollSummaryProps {
  payrollData: {
    periodStart: string;
    periodEnd: string;
    employeeName: string;
    departmentName: string;
    totalWorkDays: number;
    holidays: number;
    regularHours: number;
    overtimeHours: number;
    daysPresent: number;
    daysAbsent: number;
    leaves: {
      sick: number;
      business: number;
      annual: number;
      unpaid: number;
    };
    earnings: {
      basePay: number;
      overtimePay: number;
      holidayPay: number;
      allowances: number;
      totalDeductions: number;
      netPayable: number;
    };
  };
}

const PayrollSummary: React.FC<PayrollSummaryProps> = ({ payrollData }) => {
  return (
    <div className="space-y-6">
      {/* Period Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="mr-2" />
            Payroll Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">
              {format(new Date(payrollData.periodStart), 'MMMM yyyy', {
                locale: th,
              })}
            </p>
            <p className="text-sm text-gray-600">
              {format(new Date(payrollData.periodStart), 'd MMM', {
                locale: th,
              })}{' '}
              -{' '}
              {format(new Date(payrollData.periodEnd), 'd MMM yyyy', {
                locale: th,
              })}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <UserCheck className="mr-2" />
            Attendance Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Work Days:</span>
                <span className="font-medium">{payrollData.totalWorkDays}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Days Present:</span>
                <span className="font-medium">{payrollData.daysPresent}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Days Absent:</span>
                <span className="font-medium">{payrollData.daysAbsent}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Holidays:</span>
                <span className="font-medium">{payrollData.holidays}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Regular Hours:</span>
                <span className="font-medium">{payrollData.regularHours}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Overtime Hours:</span>
                <span className="font-medium">{payrollData.overtimeHours}</span>
              </div>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Sick Leave:</span>
              <span className="font-medium">{payrollData.leaves.sick}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Business Leave:</span>
              <span className="font-medium">{payrollData.leaves.business}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Annual Leave:</span>
              <span className="font-medium">{payrollData.leaves.annual}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Unpaid Leave:</span>
              <span className="font-medium text-red-600">
                {payrollData.leaves.unpaid}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Wallet className="mr-2" />
            Earnings Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Base Pay:</span>
              <span className="font-medium">
                ฿{payrollData.earnings.basePay.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Overtime Pay:</span>
              <span className="font-medium">
                ฿{payrollData.earnings.overtimePay.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Holiday Pay:</span>
              <span className="font-medium">
                ฿{payrollData.earnings.holidayPay.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Allowances:</span>
              <span className="font-medium">
                ฿{payrollData.earnings.allowances.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center text-red-600">
              <span>Total Deductions:</span>
              <span className="font-medium">
                -฿{payrollData.earnings.totalDeductions.toLocaleString()}
              </span>
            </div>
            <div className="pt-3 border-t">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-lg">Net Payable:</span>
                <span className="font-bold text-lg text-green-600">
                  ฿{payrollData.earnings.netPayable.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PayrollSummary;

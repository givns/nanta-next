// components/admin/payroll/PayrollDetail.tsx

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PayrollUtils } from '@/utils/payrollUtils';
import { PayrollComponentProps } from '@/types/payroll/components';

interface DetailRowProps {
  label: string;
  hours: number;
  rate: number;
  amount: number;
}

export const PayrollDetail: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => {
  const DetailRow: React.FC<DetailRowProps> = ({
    label,
    hours,
    rate,
    amount,
  }) => (
    <TableRow>
      <TableCell>
        <div className="space-y-1">
          <span>{label}</span>
          <Badge variant="outline" className="ml-2">
            {rate}x
          </Badge>
        </div>
      </TableCell>
      <TableCell>{PayrollUtils.formatHours(hours)}</TableCell>
      <TableCell className="text-right">
        {PayrollUtils.formatCurrency(amount)}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      {/* Regular Hours & Base Pay */}
      <Card>
        <CardHeader>
          <CardTitle>Regular Hours & Base Pay</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Regular Hours</p>
              <p className="text-lg font-semibold">
                {PayrollUtils.formatHours(payrollData.regularHours)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Base Pay</p>
              <p className="text-lg font-semibold text-green-600">
                {PayrollUtils.formatCurrency(payrollData.basePay)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overtime Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Overtime Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <DetailRow
                label="Workday (Outside Shift)"
                hours={payrollData.overtimeHoursByType.workdayOutside}
                rate={payrollData.overtimeRatesByType.workdayOutside}
                amount={payrollData.overtimePayByType.workdayOutside}
              />
              <DetailRow
                label="Weekend (Regular)"
                hours={payrollData.overtimeHoursByType.weekendInside}
                rate={payrollData.overtimeRatesByType.weekendInside}
                amount={payrollData.overtimePayByType.weekendInside}
              />
              <DetailRow
                label="Weekend (Outside)"
                hours={payrollData.overtimeHoursByType.weekendOutside}
                rate={payrollData.overtimeRatesByType.weekendOutside}
                amount={payrollData.overtimePayByType.weekendOutside}
              />
              <DetailRow
                label="Holiday (Regular)"
                hours={payrollData.overtimeHoursByType.holidayRegular}
                rate={payrollData.overtimeRatesByType.holidayRegular}
                amount={payrollData.overtimePayByType.holidayRegular}
              />
              <DetailRow
                label="Holiday (Overtime)"
                hours={payrollData.overtimeHoursByType.holidayOvertime}
                rate={payrollData.overtimeRatesByType.holidayOvertime}
                amount={payrollData.overtimePayByType.holidayOvertime}
              />
              <TableRow className="font-semibold">
                <TableCell>Total Overtime</TableCell>
                <TableCell>
                  {PayrollUtils.formatHours(payrollData.totalOvertimeHours)}
                </TableCell>
                <TableCell className="text-right text-green-600">
                  {PayrollUtils.formatCurrency(payrollData.totalOvertimePay)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Allowances Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Allowances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Transportation</p>
                <p className="text-lg font-medium">
                  {PayrollUtils.formatCurrency(
                    payrollData.transportationAllowance,
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Meal</p>
                <p className="text-lg font-medium">
                  {PayrollUtils.formatCurrency(payrollData.mealAllowance)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Housing</p>
                <p className="text-lg font-medium">
                  {PayrollUtils.formatCurrency(payrollData.housingAllowance)}
                </p>
              </div>
            </div>
            <div className="pt-4 border-t flex justify-between">
              <span className="font-medium">Total Allowances</span>
              <span className="font-medium text-green-600">
                {PayrollUtils.formatCurrency(payrollData.totalAllowances)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Commission Details (if applicable) */}
      {payrollData.salesAmount && payrollData.commissionRate && (
        <Card>
          <CardHeader>
            <CardTitle>Commission Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Sales Amount</p>
                  <p className="text-lg font-medium">
                    {PayrollUtils.formatCurrency(payrollData.salesAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Commission Rate</p>
                  <p className="text-lg font-medium">
                    {payrollData.commissionRate}%
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between">
                  <span>Commission Amount</span>
                  <span className="font-medium">
                    {PayrollUtils.formatCurrency(
                      payrollData.commissionAmount || 0,
                    )}
                  </span>
                </div>
                {payrollData.quarterlyBonus && (
                  <div className="flex justify-between text-green-600">
                    <span>Quarterly Bonus</span>
                    <span>
                      +{PayrollUtils.formatCurrency(payrollData.quarterlyBonus)}
                    </span>
                  </div>
                )}
                {payrollData.yearlyBonus && (
                  <div className="flex justify-between text-green-600">
                    <span>Yearly Bonus</span>
                    <span>
                      +{PayrollUtils.formatCurrency(payrollData.yearlyBonus)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deductions Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Deductions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-red-600">
              <span>Social Security</span>
              <span>
                -{PayrollUtils.formatCurrency(payrollData.socialSecurity)}
              </span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Tax</span>
              <span>-{PayrollUtils.formatCurrency(payrollData.tax)}</span>
            </div>
            <div className="flex justify-between text-red-600">
              <span>Unpaid Leave</span>
              <span>
                -{PayrollUtils.formatCurrency(payrollData.unpaidLeaveDeduction)}
              </span>
            </div>
            <div className="pt-4 border-t flex justify-between font-medium text-red-600">
              <span>Total Deductions</span>
              <span>
                -{PayrollUtils.formatCurrency(payrollData.totalDeductions)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Net Payable */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Net Payable</h3>
            <p className="text-2xl font-bold text-green-600">
              {PayrollUtils.formatCurrency(payrollData.netPayable)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PayrollDetail;

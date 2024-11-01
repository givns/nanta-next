// components/admin/payroll/cards/PayrollCalculation.tsx
import { PayrollComponentProps } from '@/types/payroll/components';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { PayrollUtils } from '@/utils/payrollUtils';

export const PayrollCalculation: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => (
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
                {PayrollUtils.formatCurrency(payrollData.regularHourlyRate)}/hr
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Base Amount</p>
              <p className="font-medium">
                {PayrollUtils.formatCurrency(payrollData.basePay)}
              </p>
            </div>
          </div>
        </div>

        {/* Overtime Pay */}
        <div>
          <h4 className="font-medium mb-2">Overtime Pay</h4>
          <div className="space-y-2">
            {Object.entries(payrollData.overtimePayByType).map(
              ([type, amount]) => (
                <div key={type} className="flex justify-between">
                  <span className="capitalize">
                    {type.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span>{PayrollUtils.formatCurrency(amount)}</span>
                </div>
              ),
            )}
            <div className="pt-2 border-t flex justify-between font-medium">
              <span>Total Overtime</span>
              <span>
                {PayrollUtils.formatCurrency(payrollData.totalOvertimePay)}
              </span>
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
                {PayrollUtils.formatCurrency(
                  payrollData.transportationAllowance,
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Meal</p>
              <p className="font-medium">
                {PayrollUtils.formatCurrency(payrollData.mealAllowance)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Housing</p>
              <p className="font-medium">
                {PayrollUtils.formatCurrency(payrollData.housingAllowance)}
              </p>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t flex justify-between">
            <span>Total Allowances</span>
            <span>
              {PayrollUtils.formatCurrency(payrollData.totalAllowances)}
            </span>
          </div>
        </div>

        {/* Deductions */}
        <div>
          <h4 className="font-medium mb-2">Deductions</h4>
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
            <div className="pt-2 border-t flex justify-between font-medium text-red-600">
              <span>Total Deductions</span>
              <span>
                -{PayrollUtils.formatCurrency(payrollData.totalDeductions)}
              </span>
            </div>
          </div>
        </div>

        {/* Commission Section */}
        {payrollData.salesAmount && payrollData.commissionRate && (
          <div>
            <h4 className="font-medium mb-2">Commission</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Sales Amount</span>
                <span>
                  {PayrollUtils.formatCurrency(payrollData.salesAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Commission ({payrollData.commissionRate}%)</span>
                <span>
                  {PayrollUtils.formatCurrency(
                    payrollData.commissionAmount || 0,
                  )}
                </span>
              </div>
              {payrollData.quarterlyBonus && (
                <div className="flex justify-between">
                  <span>Quarterly Bonus</span>
                  <span>
                    {PayrollUtils.formatCurrency(payrollData.quarterlyBonus)}
                  </span>
                </div>
              )}
              {payrollData.yearlyBonus && (
                <div className="flex justify-between">
                  <span>Yearly Bonus</span>
                  <span>
                    {PayrollUtils.formatCurrency(payrollData.yearlyBonus)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Net Payable */}
        <div className="pt-4 border-t">
          <div className="flex justify-between items-center">
            <h4 className="text-lg font-semibold">Net Payable</h4>
            <p className="text-2xl font-bold text-green-600">
              {PayrollUtils.formatCurrency(payrollData.netPayable)}
            </p>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
);

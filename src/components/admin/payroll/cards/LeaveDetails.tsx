// components/admin/payroll/cards/LeaveDetails.tsx
import { PayrollComponentProps } from '@/types/payroll/components';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { PayrollUtils } from '@/utils/payrollUtils';

export const LeaveDetails: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => (
  <Card>
    <CardHeader>
      <CardTitle>Leave Summary</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <h4 className="text-sm font-medium text-gray-500">Sick Leave</h4>
          <p className="text-xl font-bold">{payrollData.sickLeaveDays} days</p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-500">Annual Leave</h4>
          <p className="text-xl font-bold">
            {payrollData.annualLeaveDays} days
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-500">Business Leave</h4>
          <p className="text-xl font-bold">
            {payrollData.businessLeaveDays} days
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-500">Unpaid Leave</h4>
          <p className="text-xl font-bold text-red-600">
            {payrollData.unpaidLeaveDays} days
          </p>
        </div>
        <div>
          <h4 className="text-sm font-medium text-gray-500">Holidays</h4>
          <p className="text-xl font-bold">{payrollData.holidays} days</p>
        </div>
      </div>

      {/* Deduction Summary */}
      {payrollData.unpaidLeaveDeduction > 0 && (
        <div className="mt-6 pt-4 border-t">
          <div className="flex justify-between items-center text-red-600">
            <h4 className="font-medium">Leave Deductions</h4>
            <p className="text-lg font-bold">
              -{PayrollUtils.formatCurrency(payrollData.unpaidLeaveDeduction)}
            </p>
          </div>
        </div>
      )}
    </CardContent>
  </Card>
);

// components/admin/payroll/cards/OverviewCards.tsx
import { PayrollComponentProps } from '@/types/payroll/components';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UserCheck, Calendar } from 'lucide-react';
import { PayrollUtils } from '@/utils/payrollUtils';

export const OverviewCards: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
    {/* Employee Info Card */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <UserCheck className="mr-2" />
          Employee Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-500">Name:</span>
            <span className="font-medium">{payrollData.employee.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Department:</span>
            <span className="font-medium">
              {payrollData.employee.departmentName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Position:</span>
            <span className="font-medium">{payrollData.employee.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Employee Type:</span>
            <Badge variant="outline" className="capitalize">
              {payrollData.employee.employeeType.toLowerCase()}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Period Summary Card */}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Calendar className="mr-2" />
          Period Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Working Days</p>
              <p className="text-xl font-bold">
                {payrollData.totalWorkingDays}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Days Present</p>
              <p className="text-xl font-bold">{payrollData.totalPresent}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Days Absent</p>
              <p className="text-xl font-bold text-red-600">
                {payrollData.totalAbsent}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Holidays</p>
              <p className="text-xl font-bold">{payrollData.holidays}</p>
            </div>
          </div>

          {/* Total Earnings */}
          <div className="pt-4 border-t">
            <div className="flex justify-between items-baseline">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <Badge variant="outline" className="mt-1 capitalize">
                  {payrollData.status.toLowerCase()}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-500">Net Payable</p>
                <p className="text-xl font-bold text-green-600">
                  {PayrollUtils.formatCurrency(payrollData.netPayable)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

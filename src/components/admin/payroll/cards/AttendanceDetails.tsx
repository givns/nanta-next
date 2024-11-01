// components/admin/payroll/cards/AttendanceDetails.tsx
import { PayrollComponentProps } from '@/types/payroll/components';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';
import { PayrollUtils } from '@/utils/payrollUtils';
import { Badge } from '@/components/ui/badge';

export const AttendanceDetails: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => {
  const getOvertimeLabel = (
    type: keyof typeof payrollData.overtimeHoursByType,
  ) => {
    const labels = {
      workdayOutside: 'Workday (Outside Shift)',
      weekendInside: 'Weekend (Regular Hours)',
      weekendOutside: 'Weekend (Outside Shift)',
      holidayRegular: 'Holiday (Regular)',
      holidayOvertime: 'Holiday (Overtime)',
    };
    return labels[type];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="mr-2" />
          Attendance & Hours
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Regular Hours Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-gray-500">
                Regular Hours
              </h4>
              <p className="text-2xl font-bold">{payrollData.regularHours}</p>
              <p className="text-sm text-gray-500">
                Base Rate:{' '}
                {PayrollUtils.formatCurrency(payrollData.regularHourlyRate)}/hr
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500">Base Amount</h4>
              <p className="text-2xl font-bold">
                {PayrollUtils.formatCurrency(payrollData.basePay)}
              </p>
            </div>
          </div>

          {/* Overtime Breakdown */}
          <div className="space-y-4">
            <h4 className="font-medium">Overtime Breakdown</h4>
            {Object.entries(payrollData.overtimeHoursByType).map(
              ([type, hours]) => (
                <div
                  key={type}
                  className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg"
                >
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">
                      {getOvertimeLabel(
                        type as keyof typeof payrollData.overtimeHoursByType,
                      )}
                    </p>
                    <p className="font-medium">
                      {PayrollUtils.formatHours(hours)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Rate</p>
                    <p className="font-medium">
                      {
                        payrollData.overtimeRatesByType[
                          type as keyof typeof payrollData.overtimeRatesByType
                        ]
                      }
                      x
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Amount</p>
                    <p className="font-medium">
                      {PayrollUtils.formatCurrency(
                        payrollData.overtimePayByType[
                          type as keyof typeof payrollData.overtimePayByType
                        ],
                      )}
                    </p>
                  </div>
                </div>
              ),
            )}

            {/* Total Overtime */}
            <div className="grid grid-cols-4 gap-2 border-t pt-4 mt-4">
              <div className="col-span-2">
                <p className="font-medium">Total Overtime</p>
                <p className="text-xl font-bold">
                  {PayrollUtils.formatHours(payrollData.totalOvertimeHours)}
                </p>
              </div>
              <div className="col-span-2 text-right">
                <p className="font-medium">Total Amount</p>
                <p className="text-xl font-bold text-green-600">
                  {PayrollUtils.formatCurrency(payrollData.totalOvertimePay)}
                </p>
              </div>
            </div>
          </div>

          {/* Attendance Stats */}
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <h4 className="text-sm font-medium text-gray-500">
                Late Minutes
              </h4>
              <p className="text-lg font-medium">
                {payrollData.totalLateMinutes} mins
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-500">
                Early Departures
              </h4>
              <p className="text-lg font-medium">
                {payrollData.earlyDepartures} mins
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

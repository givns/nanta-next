// components/admin/payroll/cards/MobileCards.tsx
import { PayrollComponentProps } from '@/types/payroll/components';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PayrollUtils } from '@/utils/payrollUtils';

interface MobileCardsProps extends PayrollComponentProps {
  activeTab: string;
}

export const MobileCards: React.FC<MobileCardsProps> = ({
  payrollData,
  activeTab,
}) => {
  if (activeTab === 'overview') {
    return <MobileOverviewCards payrollData={payrollData} />;
  }

  // Each tab gets its own optimized mobile view
  const TabContent = {
    attendance: <MobileAttendanceCards payrollData={payrollData} />,
    leaves: <MobileLeaveCards payrollData={payrollData} />,
    calculation: <MobileCalculationCards payrollData={payrollData} />,
  }[activeTab];

  return <div className="md:hidden">{TabContent}</div>;
};

// Mobile Overview Cards
const MobileOverviewCards: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => (
  <div className="space-y-4">
    {/* Employee Summary Card */}
    <Card>
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold">{payrollData.employee.name}</h2>
              <p className="text-gray-500">
                {payrollData.employee.departmentName}
              </p>
              <p className="text-sm text-gray-500">
                {payrollData.employee.role}
              </p>
            </div>
            <Badge variant="outline" className="capitalize">
              {payrollData.employee.employeeType.toLowerCase()}
            </Badge>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Working Days</p>
                <p className="text-lg font-semibold">
                  {payrollData.totalWorkingDays}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Present</p>
                <p className="text-lg font-semibold">
                  {payrollData.totalPresent}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Quick Stats Card */}
    <Card>
      <CardContent className="p-4">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Regular Hours</p>
              <p className="text-lg font-semibold">
                {payrollData.regularHours}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Overtime Hours</p>
              <p className="text-lg font-semibold">
                {payrollData.totalOvertimeHours}
              </p>
            </div>
          </div>
          <div className="pt-4 border-t flex justify-between items-baseline">
            <p className="text-sm text-gray-500">Net Payable</p>
            <p className="text-xl font-bold text-green-600">
              {PayrollUtils.formatCurrency(payrollData.netPayable)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

// Mobile Attendance Cards
const MobileAttendanceCards: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => (
  <div className="space-y-4">
    {/* Hours Summary Card */}
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium mb-3">Hours Summary</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Regular</p>
              <p className="text-lg font-semibold">
                {payrollData.regularHours}h
              </p>
              <p className="text-sm text-gray-500">
                {PayrollUtils.formatCurrency(payrollData.regularHourlyRate)}/hr
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Base Pay</p>
              <p className="text-lg font-semibold">
                {PayrollUtils.formatCurrency(payrollData.basePay)}
              </p>
            </div>
          </div>
          <div className="pt-3 border-t">
            <h4 className="text-sm font-medium text-gray-500 mb-2">Overtime</h4>
            {Object.entries(payrollData.overtimeHoursByType).map(
              ([type, hours]) => (
                <div key={type} className="flex justify-between py-1">
                  <span className="text-sm capitalize">
                    {type.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="font-medium">{hours}h</span>
                </div>
              ),
            )}
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Attendance Details Card */}
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium mb-3">Attendance Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Late Minutes</p>
            <p className="text-lg font-medium">
              {payrollData.totalLateMinutes}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Early Departures</p>
            <p className="text-lg font-medium">{payrollData.earlyDepartures}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
);

// Mobile Leave Cards
const MobileLeaveCards: React.FC<PayrollComponentProps> = ({ payrollData }) => (
  <div className="space-y-4">
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Sick Leave</p>
            <p className="text-lg font-semibold">
              {payrollData.sickLeaveDays}d
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Annual Leave</p>
            <p className="text-lg font-semibold">
              {payrollData.annualLeaveDays}d
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Business Leave</p>
            <p className="text-lg font-semibold">
              {payrollData.businessLeaveDays}d
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Unpaid Leave</p>
            <p className="text-lg font-semibold text-red-600">
              {payrollData.unpaidLeaveDays}d
            </p>
          </div>
        </div>
        {payrollData.unpaidLeaveDeduction > 0 && (
          <div className="mt-4 pt-4 border-t flex justify-between">
            <span className="text-sm text-gray-500">Deduction</span>
            <span className="text-lg font-semibold text-red-600">
              -{PayrollUtils.formatCurrency(payrollData.unpaidLeaveDeduction)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  </div>
);

// Mobile Calculation Cards
const MobileCalculationCards: React.FC<PayrollComponentProps> = ({
  payrollData,
}) => (
  <div className="space-y-4">
    {/* Base Pay and Overtime Card */}
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium mb-3">Earnings</h3>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span>Base Pay</span>
            <span className="font-medium">
              {PayrollUtils.formatCurrency(payrollData.basePay)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Overtime Pay</span>
            <span className="font-medium">
              {PayrollUtils.formatCurrency(payrollData.totalOvertimePay)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Allowances Card */}
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium mb-3">Allowances</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span>Transportation</span>
            <span>
              {PayrollUtils.formatCurrency(payrollData.transportationAllowance)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Meal</span>
            <span>
              {PayrollUtils.formatCurrency(payrollData.mealAllowance)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Housing</span>
            <span>
              {PayrollUtils.formatCurrency(payrollData.housingAllowance)}
            </span>
          </div>
          <div className="pt-2 border-t flex justify-between font-medium">
            <span>Total</span>
            <span>
              {PayrollUtils.formatCurrency(payrollData.totalAllowances)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Deductions Card */}
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium mb-3">Deductions</h3>
        <div className="space-y-2">
          {Object.entries({
            'Social Security': payrollData.socialSecurity,
            Tax: payrollData.tax,
            'Unpaid Leave': payrollData.unpaidLeaveDeduction,
          }).map(
            ([label, amount]) =>
              amount > 0 && (
                <div key={label} className="flex justify-between text-red-600">
                  <span>{label}</span>
                  <span>-{PayrollUtils.formatCurrency(amount)}</span>
                </div>
              ),
          )}
          <div className="pt-2 border-t flex justify-between font-medium text-red-600">
            <span>Total Deductions</span>
            <span>
              -{PayrollUtils.formatCurrency(payrollData.totalDeductions)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>

    {/* Net Payable Card */}
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-baseline">
          <h3 className="text-lg font-medium">Net Payable</h3>
          <p className="text-xl font-bold text-green-600">
            {PayrollUtils.formatCurrency(payrollData.netPayable)}
          </p>
        </div>
      </CardContent>
    </Card>
  </div>
);

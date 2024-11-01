// components/admin/payroll/controls/DesktopControls.tsx

import { PayrollPeriodSelector } from '@/components/payroll/PayrollPeriodSelector';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { PayrollControlProps } from '@/types/payroll/components';

export const DesktopControls: React.FC<PayrollControlProps> = ({
  selectedEmployee,
  selectedPeriod,
  employees,
  onEmployeeChange,
  onPeriodChange,
  onCalculate,
  isLoading,
}) => (
  <div className="flex items-center space-x-4">
    <Select value={selectedEmployee} onValueChange={onEmployeeChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select Employee" />
      </SelectTrigger>
      <SelectContent>
        {employees.map((employee) => (
          <SelectItem key={employee.employeeId} value={employee.employeeId}>
            {employee.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>

    <PayrollPeriodSelector
      currentValue={selectedPeriod}
      onChange={onPeriodChange}
      disabled={isLoading}
    />

    <Button
      onClick={onCalculate}
      disabled={isLoading || !selectedEmployee || !selectedPeriod}
    >
      {isLoading ? 'Calculating...' : 'Calculate Payroll'}
    </Button>
  </div>
);

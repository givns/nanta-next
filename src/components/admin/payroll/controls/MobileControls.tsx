// components/admin/payroll/controls/MobileControls.tsx

import { PayrollPeriodSelector } from '@/components/payroll/PayrollPeriodSelector';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PayrollControlProps } from '@/types/payroll/components';

export const MobileControls: React.FC<PayrollControlProps> = ({
  selectedEmployee,
  selectedPeriod,
  employees,
  onEmployeeChange,
  onPeriodChange,
  onCalculate,
  isLoading,
}) => (
  <div className="space-y-4">
    <Select value={selectedEmployee} onValueChange={onEmployeeChange}>
      <SelectTrigger className="w-full">
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
      className="w-full"
    >
      {isLoading ? 'Calculating...' : 'Calculate Payroll'}
    </Button>
  </div>
);

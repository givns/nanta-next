import { PayrollCalculationResult } from './index';
import { PeriodRange } from '@/utils/payrollUtils';

export interface PayrollComponentProps {
  payrollData: PayrollCalculationResult;
}

export interface PayrollControlProps {
  selectedEmployee: string;
  selectedPeriod: string;
  employees: Array<{ employeeId: string; name: string }>;
  periods: Array<PeriodRange>;
  onEmployeeChange: (value: string) => void;
  onPeriodChange: (value: string) => void;
  onCalculate: () => void;
  isLoading: boolean;
}

// components/admin/PayrollPeriodSelector.tsx

import { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon } from 'lucide-react';
import { PayrollUtils } from '@/utils/payrollUtils';

interface PayrollPeriodSelectorProps {
  currentValue: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  showBadges?: boolean;
}

export const PayrollPeriodSelector: React.FC<PayrollPeriodSelectorProps> = ({
  currentValue,
  onChange,
  disabled = false,
  showBadges = true,
}) => {
  const periods = PayrollUtils.generatePayrollPeriods();

  return (
    <div className="flex items-center space-x-2">
      <Select value={currentValue} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-[280px]">
          <div className="flex items-center">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Select Period" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {periods.map((period) => (
            <SelectItem
              key={period.value}
              value={period.value}
              className="flex items-center justify-between"
            >
              <div className="flex items-center justify-between w-full">
                <span>{period.label}</span>
                {showBadges && period.isCurrentPeriod && (
                  <Badge variant="secondary" className="ml-2">
                    Current
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

// components/admin/PayrollPeriodSelector.tsx

import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
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

const formatPayrollMonth = (periodValue: string) => {
  const [startDate, endDate] = periodValue.split('_');
  // The payroll month is the month of the end date since it represents
  // the month for which the payroll is being processed
  const endDateObj = parseISO(endDate);
  return format(endDateObj, 'MMMM yyyy', { locale: th });
};

const formatDateRange = (periodValue: string) => {
  const [startDate, endDate] = periodValue.split('_');
  return `${format(parseISO(startDate), 'd MMM', { locale: th })} - ${format(
    parseISO(endDate),
    'd MMM yyyy',
    { locale: th },
  )}`;
};

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
            <SelectValue placeholder="Select Period">
              {currentValue && (
                <div className="flex flex-col">
                  <span className="font-medium">
                    {formatPayrollMonth(currentValue)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatDateRange(currentValue)}
                  </span>
                </div>
              )}
            </SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          {periods.map((period) => (
            <SelectItem
              key={period.value}
              value={period.value}
              className="flex items-center justify-between"
            >
              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between w-full">
                  <span className="font-medium">
                    {formatPayrollMonth(period.value)}
                  </span>
                  {showBadges && period.isCurrentPeriod && (
                    <Badge variant="secondary" className="ml-2">
                      Current
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {formatDateRange(period.value)}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default PayrollPeriodSelector;

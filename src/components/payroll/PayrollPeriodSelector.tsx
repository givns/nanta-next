import React, { useState, useEffect, useMemo } from 'react';
import { format, parse, setDate, subMonths } from 'date-fns';
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
import { PayrollPeriodDisplay } from '@/types/payroll';

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
  // Generate periods for last 12 months
  const periods = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(now, i);
      const startDate = setDate(subMonths(date, 1), 26);
      const endDate = setDate(date, 25);

      return {
        value: format(startDate, 'yyyy-MM'),
        label: `${format(startDate, 'MMM dd', { locale: th })} - ${format(endDate, 'MMM dd, yyyy', { locale: th })}`,
        startDate,
        endDate,
        isPending: i === 0,
      };
    });
  }, []);

  return (
    <div className="flex items-center space-x-2">
      <Select value={currentValue} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-[280px]">
          <div className="flex items-center">
            <CalendarIcon className="mr-2 h-4 w-4" />
            <SelectValue placeholder="เลือกรอบเงินเดือน" />
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
                {showBadges && period.isPending && (
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

export default PayrollPeriodSelector;

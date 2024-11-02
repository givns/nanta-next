import { useState, useEffect } from 'react';
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
import { PayrollUtils, PeriodRange } from '@/utils/payrollUtils';

interface PayrollPeriodSelectorProps {
  currentValue: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  showBadges?: boolean;
}

interface FormattedPeriod {
  startDate: string;
  endDate: string;
}

interface PeriodDisplay {
  label: string;
  dates: string;
}

export const PayrollPeriodSelector: React.FC<PayrollPeriodSelectorProps> = ({
  currentValue,
  onChange,
  disabled = false,
  showBadges = true,
}) => {
  const [periods] = useState(() => PayrollUtils.generatePayrollPeriods());

  const formatPeriodToString = (period: PeriodRange): FormattedPeriod => {
    return {
      startDate: format(period.startDate, 'yyyy-MM-dd'),
      endDate: format(period.endDate, 'yyyy-MM-dd'),
    };
  };

  const formatPeriodLabel = (period: PeriodRange): string => {
    return format(period.endDate, 'MMMM yyyy', { locale: th });
  };

  const formatPeriodDates = (period: PeriodRange): string => {
    return `${format(period.startDate, 'd MMM', { locale: th })} - ${format(period.endDate, 'd MMM yyyy', { locale: th })}`;
  };

  const getCurrentPeriodValue = (): PeriodDisplay | null => {
    if (!currentValue) return null;
    const period = periods.find((p) => p.value === currentValue);
    if (!period) return null;

    return {
      label: formatPeriodLabel(period),
      dates: formatPeriodDates(period),
    };
  };

  const currentPeriodDisplay = getCurrentPeriodValue();

  return (
    <div className="flex items-center space-x-2">
      <Select value={currentValue} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-[280px]">
          <div className="flex items-center">
            <CalendarIcon className="mr-2 h-4 w-4" />
            {currentPeriodDisplay ? (
              <div className="flex flex-col">
                <span className="font-medium">
                  {currentPeriodDisplay.label}
                </span>
                <span className="text-sm text-gray-500">
                  {currentPeriodDisplay.dates}
                </span>
              </div>
            ) : (
              <span>Select Period</span>
            )}
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
                    {formatPeriodLabel(period)}
                  </span>
                  {showBadges && period.isCurrentPeriod && (
                    <Badge variant="secondary" className="ml-2">
                      Current
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-gray-500">
                  {formatPeriodDates(period)}
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

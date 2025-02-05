import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  format,
  isValid,
  parseISO,
  startOfDay,
  isAfter,
  isBefore,
} from 'date-fns';
import { th } from 'date-fns/locale/th';
import { CalendarIcon } from 'lucide-react';
import { useMemo } from 'react';

interface DateSelectorProps {
  date: Date | string;
  onChange: (date: Date | undefined) => void;
  fromYear?: number;
  toYear?: number;
  minDate?: Date;
  maxDate?: Date;
  DateSelectorProps?: boolean;
  disableFutureDates?: boolean;
  className?: string;
}

export function DateSelector({
  date,
  onChange,
  fromYear = 2024,
  toYear = new Date().getFullYear(),
  minDate,
  maxDate,
  disableFutureDates = true,
  className,
}: DateSelectorProps) {
  // Validate and process the date input
  const validDate = useMemo(() => {
    try {
      // Handle Date object
      if (date instanceof Date) {
        return isValid(date) ? startOfDay(date) : startOfDay(new Date());
      }

      // Handle ISO string
      if (typeof date === 'string') {
        // First try parsing as ISO date
        const parsedDate = parseISO(date);
        if (isValid(parsedDate)) {
          return startOfDay(parsedDate);
        }

        // If that fails, try creating a new date
        const fallbackDate = new Date(date);
        if (isValid(fallbackDate)) {
          return startOfDay(fallbackDate);
        }
      }

      // Fallback to current date
      console.warn('Invalid date input, falling back to current date:', date);
      return startOfDay(new Date());
    } catch (error) {
      console.error('Error processing date:', error);
      return startOfDay(new Date());
    }
  }, [date]);

  // Date constraints
  const dateConstraints = useMemo(() => {
    const today = startOfDay(new Date());
    const defaultMinDate = new Date(fromYear, 0, 1);
    const defaultMaxDate =
      maxDate || (disableFutureDates ? today : new Date(toYear, 11, 31));

    return {
      min: minDate || defaultMinDate,
      max: defaultMaxDate,
    };
  }, [fromYear, toYear, minDate, maxDate, disableFutureDates]);

  // Handle date selection with validation
  const handleDateSelect = (newDate: Date | undefined) => {
    if (!newDate) {
      onChange(undefined);
      return;
    }

    try {
      const processedDate = startOfDay(newDate);

      // Validate against constraints
      if (isBefore(processedDate, dateConstraints.min)) {
        console.warn('Selected date is before minimum allowed date');
        return;
      }

      if (isAfter(processedDate, dateConstraints.max)) {
        console.warn('Selected date is after maximum allowed date');
        return;
      }

      onChange(processedDate);
    } catch (error) {
      console.error('Error handling date selection:', error);
    }
  };

  // Format date for display
  const formattedDate = useMemo(() => {
    try {
      if (!isValid(validDate)) {
        throw new Error('Invalid date for formatting');
      }
      return format(validDate, 'EEEE, d MMMM yyyy', { locale: th });
    } catch (error) {
      console.error('Error formatting date:', error);
      return format(new Date(), 'EEEE, d MMMM yyyy', { locale: th });
    }
  }, [validDate]);

  // Disable dates function
  const isDateDisabled = useMemo(() => {
    return (date: Date) => {
      const startOfDate = startOfDay(date);
      return (
        isBefore(startOfDate, dateConstraints.min) ||
        isAfter(startOfDate, dateConstraints.max)
      );
    };
  }, [dateConstraints]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`gap-2 ${className}`}
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarIcon className="h-4 w-4" />
          <span className="text-left">{formattedDate}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={validDate}
          onSelect={handleDateSelect}
          disabled={isDateDisabled}
          initialFocus
          fromYear={fromYear}
          toYear={toYear}
        />
      </PopoverContent>
    </Popover>
  );
}

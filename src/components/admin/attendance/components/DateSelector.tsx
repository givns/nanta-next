import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format, isValid, parseISO, startOfDay } from 'date-fns';
import { th } from 'date-fns/locale/th';
import { CalendarIcon } from 'lucide-react';

interface DateSelectorProps {
  date: Date | string;
  onChange: (date: Date | undefined) => void;
}

export function DateSelector({ date, onChange }: DateSelectorProps) {
  // Ensure we have a valid date object
  const getValidDate = (dateInput: Date | string): Date => {
    try {
      if (dateInput instanceof Date) {
        return isValid(dateInput)
          ? startOfDay(dateInput)
          : startOfDay(new Date());
      }

      const parsedDate = parseISO(dateInput);
      return isValid(parsedDate)
        ? startOfDay(parsedDate)
        : startOfDay(new Date());
    } catch (error) {
      console.warn('Invalid date input:', dateInput);
      return startOfDay(new Date());
    }
  };

  const validDate = getValidDate(date);

  const handleDateSelect = (newDate: Date | undefined) => {
    if (newDate && isValid(newDate)) {
      onChange(startOfDay(newDate));
    }
  };

  const formatDate = (date: Date): string => {
    try {
      return format(date, 'EEEE, d MMMM yyyy', { locale: th });
    } catch (error) {
      console.error('Error formatting date:', error);
      return format(new Date(), 'EEEE, d MMMM yyyy', { locale: th });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <CalendarIcon className="h-4 w-4" />
          {formatDate(validDate)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={validDate}
          onSelect={handleDateSelect}
          initialFocus
          disabled={(date) => date > new Date()} // Disable future dates
          fromYear={2024} // Limit selectable years
          toYear={new Date().getFullYear()}
        />
      </PopoverContent>
    </Popover>
  );
}

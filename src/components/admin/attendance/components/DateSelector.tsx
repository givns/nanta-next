// components/admin/attendance/components/DateSelector.tsx

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar'; // Import from shadcn/ui
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { th } from 'date-fns/locale/th';
import { CalendarIcon } from 'lucide-react'; // Only import the icon from lucide

interface DateSelectorProps {
  date: Date;
  onChange: (date: Date | undefined) => void;
}

export function DateSelector({ date, onChange }: DateSelectorProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarIcon className="h-4 w-4" />
          {format(date, 'EEEE, d MMMM yyyy', { locale: th })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onChange}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

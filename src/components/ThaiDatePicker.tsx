import React from 'react';
import { th } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const thaiMonths = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const formatThaiDate = (date: Date | undefined) => {
  if (!date) return 'เลือกวันที่';
  const day = date.getDate();
  const month = thaiMonths[date.getMonth()];
  const year = date.getFullYear() + 543; // Convert to Buddhist Era
  return `${day} ${month} ${year}`;
};

interface ThaiDatePickerProps {
  field: any;
  form: any;
  onChange?: (date: Date | undefined) => void;
}

const ThaiDatePicker: React.FC<ThaiDatePickerProps> = ({
  field,
  form,
  onChange,
}) => {
  const [date, setDate] = React.useState<Date | undefined>(
    field.value ? new Date(field.value) : undefined,
  );

  const handleSelect = (newDate: Date | undefined) => {
    setDate(newDate);
    form.setFieldValue(field.name, newDate);

    // Call both the form's onChange and the provided onChange
    if (field.onChange) {
      field.onChange({
        target: {
          name: field.name,
          value: newDate,
        },
      });
    }

    if (onChange) {
      onChange(newDate);
    }
  };

  // Update local state when field value changes externally
  React.useEffect(() => {
    if (field.value && (!date || field.value !== date.toISOString())) {
      setDate(new Date(field.value));
    }
  }, [field.value]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-full justify-start text-left font-normal',
            !date && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {formatThaiDate(date)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 bg-popover" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          locale={th}
          formatters={{
            formatCaption: (date) => {
              const month = thaiMonths[date.getMonth()];
              const year = date.getFullYear() + 543;
              return `${month} ${year}`;
            },
          }}
          initialFocus
          className="max-h-[300px] overflow-y-auto"
        />
      </PopoverContent>
    </Popover>
  );
};

export default ThaiDatePicker;

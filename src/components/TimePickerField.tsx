import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TimePickerFieldProps {
  field: any;
  form: any;
}

const TimePickerField: React.FC<TimePickerFieldProps> = ({ field, form }) => {
  const [time, setTime] = React.useState(field.value);

  const handleTimeChange = (newTime: string) => {
    setTime(newTime);
    form.setFieldValue(field.name, newTime);
  };

  return (
    <Select value={time} onValueChange={handleTimeChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="เลือกเวลา" />
      </SelectTrigger>
      <SelectContent className="max-h-[300px] overflow-y-auto">
        {Array.from({ length: 24 * 4 }, (_, i) => {
          const hours = Math.floor(i / 4);
          const minutes = (i % 4) * 15;
          const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
          return (
            <SelectItem key={i} value={timeString}>
              {timeString}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export default TimePickerField;

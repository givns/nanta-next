'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function Component() {
  const [hours, setHours] = React.useState('12');
  const [minutes, setMinutes] = React.useState('00');
  const [period, setPeriod] = React.useState('AM');

  const formatTime = () => {
    return `${hours}:${minutes} ${period}`;
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-[280px] justify-start text-left font-normal"
        >
          <Clock className="mr-2 h-4 w-4" />
          {formatTime()}
        </Button>
      </PopoverTrigger>

      {/* Ensure proper background color and z-index */}
      <PopoverContent className="w-[280px] p-0 bg-white z-50 shadow-lg">
        <div className="flex items-center justify-between p-4">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-[70px]">
              <SelectValue placeholder="Hours" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1).padStart(2, '0')}>
                  {String(i + 1).padStart(2, '0')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-2xl">:</span>

          <Select value={minutes} onValueChange={setMinutes}>
            <SelectTrigger className="w-[70px]">
              <SelectValue placeholder="Minutes" />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 60 }, (_, i) => (
                <SelectItem key={i} value={String(i).padStart(2, '0')}>
                  {String(i).padStart(2, '0')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[70px]">
              <SelectValue placeholder="AM/PM" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AM">AM</SelectItem>
              <SelectItem value="PM">PM</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PopoverContent>
    </Popover>
  );
}

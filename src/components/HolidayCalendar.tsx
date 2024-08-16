import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table } from '@/components/ui/table';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

interface Holiday {
  date: string;
  name: string;
}

const HolidayCalendar: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [shiftType, setShiftType] = useState<'regular' | 'shift104'>('regular');
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const response = await fetch(
          `/api/holidays?year=${currentYear}&shiftType=${shiftType}`,
        );
        const data = await response.json();
        setHolidays(data);
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }
    };

    fetchHolidays();
  }, [shiftType, currentYear]);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <h2 className="text-2xl font-bold">Holiday Calendar {currentYear}</h2>
        <Select
          value={shiftType}
          onValueChange={(value: 'regular' | 'shift104') => setShiftType(value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select shift type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="regular">Regular Shift</SelectItem>
            <SelectItem value="shift104">Shift 104</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Holiday Name</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday, index) => (
              <tr key={index}>
                <td>{format(parseISO(holiday.date), 'dd/MM/yyyy')}</td>
                <td>{holiday.name}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default HolidayCalendar;

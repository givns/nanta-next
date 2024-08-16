import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
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
  id: string;
  date: Date;
  name: string;
}

const HolidayCalendar: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [shiftType, setShiftType] = useState<'regular' | 'shift104'>('regular');
  const [year, setYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const response = await fetch(
          `/api/holidays?year=${year}&shiftType=${shiftType}`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch holidays');
        }
        const data = await response.json();
        console.log('Fetched holiday data:', data); // Log fetched data

        const processedHolidays = data.map((holiday: any) => ({
          ...holiday,
          date: new Date(holiday.date),
        }));
        console.log('Processed holidays:', processedHolidays); // Log processed holidays

        setHolidays(processedHolidays);
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }
    };

    fetchHolidays();
  }, [year, shiftType]);

  console.log('Current holidays state:', holidays); // Log current state

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex justify-between items-center">
          <Select
            value={year.toString()}
            onValueChange={(value) => setYear(parseInt(value))}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025].map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={shiftType}
            onValueChange={(value: 'regular' | 'shift104') =>
              setShiftType(value)
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select shift type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="regular">Regular Shift</SelectItem>
              <SelectItem value="shift104">Shift 104</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
            {holidays.length > 0 ? (
              holidays.map((holiday) => (
                <tr key={holiday.id}>
                  <td>{format(holiday.date, 'dd/MM/yyyy')}</td>
                  <td>{holiday.name}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={2}>No holidays found</td>
              </tr>
            )}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default HolidayCalendar;

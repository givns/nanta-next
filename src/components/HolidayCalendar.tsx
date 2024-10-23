import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

interface Holiday {
  id: string;
  date: string;
  name: string;
  localName: string;
}

const HolidayCalendar: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [shiftType, setShiftType] = useState<'regular' | 'shift104'>('regular');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [editHoliday, setEditHoliday] = useState<Holiday | null>(null);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const response = await fetch(
          `/api/holidays?year=${year}&shiftType=${shiftType}`,
        );
        const data = await response.json();
        setHolidays(data);
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }
    };

    fetchHolidays();
  }, [year, shiftType]);

  const handleEditHoliday = (holiday: Holiday) => {
    setEditHoliday(holiday);
  };

  const handleSaveHoliday = async () => {
    if (editHoliday) {
      const response = await fetch(`/api/holidays/${editHoliday.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editHoliday),
      });

      if (response.ok) {
        const updatedHoliday = await response.json();
        setHolidays((prev) =>
          prev.map((h) => (h.id === updatedHoliday.id ? updatedHoliday : h)),
        );
        setEditHoliday(null);
      } else {
        console.error('Failed to update holiday');
      }
    }
  };

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
        <table className="w-full">
          <thead>
            <tr>
              <th>Date</th>
              <th>Holiday Name</th>
              <th>Local Name</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holidays.length > 0 ? (
              holidays.map((holiday) => (
                <tr key={holiday.id}>
                  <td>{format(parseISO(holiday.date), 'dd/MM/yyyy')}</td>
                  <td>{holiday.name}</td>
                  <td>{holiday.localName}</td>
                  <td>
                    <button
                      className="text-blue-600"
                      onClick={() => handleEditHoliday(holiday)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>No holidays found</td>
              </tr>
            )}
          </tbody>
        </table>
        {editHoliday && (
          <div className="modal">
            <h3>Edit Holiday</h3>
            <input
              type="text"
              value={editHoliday.name}
              onChange={(e) =>
                setEditHoliday({ ...editHoliday, name: e.target.value })
              }
            />
            <input
              type="text"
              value={editHoliday.localName}
              onChange={(e) =>
                setEditHoliday({ ...editHoliday, localName: e.target.value })
              }
            />
            <button onClick={handleSaveHoliday}>Save</button>
            <button onClick={() => setEditHoliday(null)}>Cancel</button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default HolidayCalendar;

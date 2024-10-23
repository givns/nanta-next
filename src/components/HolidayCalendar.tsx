import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Edit2, Calendar as CalendarIcon } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHolidays = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/holidays?year=${year}&shiftType=${shiftType}`,
        );
        if (!response.ok) {
          throw new Error('Failed to fetch holidays');
        }
        const data = await response.json();
        setHolidays(data);
      } catch (error) {
        console.error('Error fetching holidays:', error);
        setError('Failed to load holidays');
      } finally {
        setIsLoading(false);
      }
    };

    fetchHolidays();
  }, [year, shiftType]);

  const handleEditHoliday = (holiday: Holiday) => {
    setEditHoliday({
      ...holiday,
      date: holiday.date, // Keep as ISO string
    });
  };

  const handleSaveHoliday = async () => {
    if (!editHoliday) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/holidays/${editHoliday.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editHoliday),
      });

      if (!response.ok) {
        throw new Error('Failed to update holiday');
      }

      const updatedHoliday = await response.json();
      setHolidays((prev) =>
        prev.map((h) => (h.id === updatedHoliday.id ? updatedHoliday : h)),
      );
      setEditHoliday(null);
    } catch (error) {
      console.error('Error updating holiday:', error);
      setError('Failed to update holiday');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex justify-between items-center gap-4">
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
            onValueChange={(value) =>
              setShiftType(value as 'regular' | 'shift104')
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
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-4 text-left border">วันที่</th>
                <th className="p-4 text-left border">Holiday Name</th>
                <th className="p-4 text-left border">ชื่อวันหยุด</th>
                <th className="p-4 text-left border w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((holiday) => (
                <tr key={holiday.id} className="hover:bg-gray-50">
                  <td className="p-4 border">
                    {format(parseISO(holiday.date), 'dd MMMM yyyy', {
                      locale: th,
                    })}
                  </td>
                  <td className="p-4 border">{holiday.name}</td>
                  <td className="p-4 border">{holiday.localName}</td>
                  <td className="p-4 border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditHoliday(holiday)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Dialog open={!!editHoliday} onOpenChange={() => setEditHoliday(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>แก้ไขวันหยุด</DialogTitle>
            </DialogHeader>
            {editHoliday && (
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>วันที่</Label>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" />
                    <span>
                      {format(parseISO(editHoliday.date), 'dd MMMM yyyy', {
                        locale: th,
                      })}
                    </span>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Holiday Name</Label>
                  <Input
                    value={editHoliday.name}
                    onChange={(e) =>
                      setEditHoliday({ ...editHoliday, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>ชื่อวันหยุด</Label>
                  <Input
                    value={editHoliday.localName}
                    onChange={(e) =>
                      setEditHoliday({
                        ...editHoliday,
                        localName: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditHoliday(null)}
                disabled={isLoading}
              >
                ยกเลิก
              </Button>
              <Button onClick={handleSaveHoliday} disabled={isLoading}>
                {isLoading ? 'กำลังบันทึก...' : 'บันทึก'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default HolidayCalendar;

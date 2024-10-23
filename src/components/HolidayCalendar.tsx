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
import { Edit2, Calendar as CalendarIcon, Plus } from 'lucide-react';

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
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newHoliday, setNewHoliday] = useState<Omit<Holiday, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    name: '',
    localName: '',
  });

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        console.log(
          `Fetching holidays for year: ${year}, shiftType: ${shiftType}`,
        );
        const response = await fetch(
          `/api/holidays?year=${year}&shiftType=${shiftType}`,
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch holidays: ${response.status} ${response.statusText}`,
          );
        }
        const data = await response.json();
        console.log('Received holiday data:', data);

        if (Array.isArray(data) && data.length > 0) {
          setHolidays(data);
        } else {
          console.log('No holidays received or empty array');
          setHolidays([]);
        }
      } catch (error) {
        console.error('Error fetching holidays:', error);
      }
    };

    fetchHolidays();
  }, [year, shiftType]);

  const handleEditHoliday = (holiday: Holiday) => {
    setEditHoliday({
      ...holiday,
      date: holiday.date,
    });
    setIsAddingNew(false);
  };

  const handleAddNewHoliday = () => {
    setIsAddingNew(true);
    setEditHoliday(null);
  };

  const handleSaveHoliday = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (isAddingNew) {
        // Format the data according to the API expectations
        const holidayData = {
          date: newHoliday.date, // Make sure this is in YYYY-MM-DD format
          name: newHoliday.name,
          localName: newHoliday.localName,
        };

        const response = await fetch('/api/holidays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(holidayData),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create holiday');
        }

        const createdHoliday = await response.json();
        setHolidays((prev) => [...prev, createdHoliday]);
        setIsAddingNew(false);
        setNewHoliday({
          date: new Date().toISOString().split('T')[0],
          name: '',
          localName: '',
        });
      } else if (editHoliday) {
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
      }
    } catch (error) {
      console.error('Error saving holiday:', error);
      setError('Failed to save holiday');
    } finally {
      setIsLoading(false);
    }
  };

  const renderForm = () => {
    const holiday = isAddingNew ? newHoliday : editHoliday;
    if (!holiday) return null;

    return (
      <div className="grid gap-4 py-4">
        <div className="grid gap-2">
          <Label>วันที่</Label>
          {isAddingNew ? (
            <Input
              type="date"
              value={holiday.date}
              onChange={(e) =>
                setNewHoliday({ ...newHoliday, date: e.target.value })
              }
            />
          ) : (
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              <span>
                {format(parseISO(holiday.date), 'dd MMMM yyyy', {
                  locale: th,
                })}
              </span>
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <Label>Holiday Name</Label>
          <Input
            value={holiday.name}
            onChange={(e) =>
              isAddingNew
                ? setNewHoliday({ ...newHoliday, name: e.target.value })
                : setEditHoliday({ ...editHoliday!, name: e.target.value })
            }
          />
        </div>
        <div className="grid gap-2">
          <Label>ชื่อวันหยุด</Label>
          <Input
            value={holiday.localName}
            onChange={(e) =>
              isAddingNew
                ? setNewHoliday({ ...newHoliday, localName: e.target.value })
                : setEditHoliday({ ...editHoliday!, localName: e.target.value })
            }
          />
        </div>
      </div>
    );
  };

  const handleCloseDialog = () => {
    setEditHoliday(null);
    setIsAddingNew(false);
    setNewHoliday({
      date: new Date().toISOString().split('T')[0],
      name: '',
      localName: '',
    });
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex justify-between items-center gap-4">
          <div className="flex gap-4">
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
          <Button onClick={handleAddNewHoliday}>
            <Plus className="h-4 w-4 mr-2" /> Add Holiday
          </Button>
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

        <Dialog
          open={!!editHoliday || isAddingNew}
          onOpenChange={handleCloseDialog}
        >
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>
                {isAddingNew ? 'เพิ่มวันหยุด' : 'แก้ไขวันหยุด'}
              </DialogTitle>
            </DialogHeader>
            {renderForm()}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCloseDialog}
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

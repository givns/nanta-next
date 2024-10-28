// components/admin/leaves/holidays/HolidayCalendar.tsx
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { format, parse, isEqual } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarDays, Plus } from 'lucide-react';

interface Holiday {
  id: string;
  date: Date;
  name: string;
  localName: string;
  isRecurring: boolean;
  type: 'public' | 'company' | 'special';
}

interface HolidayType {
  value: 'public' | 'company' | 'special';
  label: string;
  badgeColor: string;
}

const holidayTypes: HolidayType[] = [
  {
    value: 'public',
    label: 'Public Holiday',
    badgeColor: 'bg-red-100 text-red-800',
  },
  {
    value: 'company',
    label: 'Company Holiday',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  {
    value: 'special',
    label: 'Special Holiday',
    badgeColor: 'bg-purple-100 text-purple-800',
  },
];

export default function HolidayCalendarView() {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    new Date(),
  );
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString(),
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newHoliday, setNewHoliday] = useState<Partial<Holiday>>({
    date: new Date(),
    type: 'public',
  });

  // Holiday date modifiers for calendar
  const holidayDates = holidays.map((h) => h.date);
  const holidayModifiers = {
    holiday: holidayDates,
  };

  // Format date range for display
  const formatDateRange = (date: Date) => {
    return format(date, 'dd MMMM yyyy', { locale: th });
  };

  // Mobile holiday card component
  const HolidayCard = ({ holiday }: { holiday: Holiday }) => (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{holiday.localName}</div>
            <div className="text-sm text-gray-500">{holiday.name}</div>
          </div>
          <Badge className={getHolidayTypeBadgeColor(holiday.type)}>
            {getHolidayTypeLabel(holiday.type)}
          </Badge>
        </div>
        <div className="mt-2 text-sm text-gray-600">
          {formatDateRange(holiday.date)}
          {holiday.isRecurring && (
            <span className="ml-2 text-blue-600">(Recurring)</span>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Holiday list component
  const HolidayList = () => (
    <div className="space-y-4">
      <div className="text-sm font-medium text-gray-500">Upcoming Holidays</div>
      <div className="space-y-2">
        {holidays
          .filter((h) => h.date >= new Date())
          .sort((a, b) => a.date.getTime() - b.date.getTime())
          .map((holiday) => (
            <div
              key={holiday.id}
              className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <div className="font-medium">{holiday.localName}</div>
                <div className="text-sm text-gray-500">
                  {formatDateRange(holiday.date)}
                </div>
              </div>
              <Badge className={getHolidayTypeBadgeColor(holiday.type)}>
                {getHolidayTypeLabel(holiday.type)}
              </Badge>
            </div>
          ))}
      </div>
    </div>
  );

  // Add holiday dialog
  const AddHolidayDialog = () => (
    <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Holiday</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Holiday Name (English)</Label>
            <Input
              value={newHoliday.name || ''}
              onChange={(e) =>
                setNewHoliday({ ...newHoliday, name: e.target.value })
              }
            />
          </div>
          <div>
            <Label>ชื่อวันหยุด (ไทย)</Label>
            <Input
              value={newHoliday.localName || ''}
              onChange={(e) =>
                setNewHoliday({ ...newHoliday, localName: e.target.value })
              }
            />
          </div>
          <div>
            <Label>Date</Label>
            <Calendar
              mode="single"
              selected={newHoliday.date}
              onSelect={(date) => setNewHoliday({ ...newHoliday, date })}
              className="rounded-md border"
            />
          </div>
          <div>
            <Label>Holiday Type</Label>
            <Select
              value={newHoliday.type}
              onValueChange={(value: 'public' | 'company' | 'special') =>
                setNewHoliday({ ...newHoliday, type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {holidayTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="recurring"
              checked={newHoliday.isRecurring}
              onChange={(e) =>
                setNewHoliday({ ...newHoliday, isRecurring: e.target.checked })
              }
              className="rounded border-gray-300"
            />
            <Label htmlFor="recurring">Recurring yearly</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowAddDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleAddHoliday}>Add Holiday</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Helper functions
  const getHolidayTypeBadgeColor = (type: string) => {
    const holidayType = holidayTypes.find((t) => t.value === type);
    return holidayType?.badgeColor || 'bg-gray-100 text-gray-800';
  };

  const getHolidayTypeLabel = (type: string) => {
    const holidayType = holidayTypes.find((t) => t.value === type);
    return holidayType?.label || type;
  };

  const handleAddHoliday = () => {
    // Add holiday logic here
    setShowAddDialog(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Holiday Calendar</CardTitle>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Holiday
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Year selector for mobile */}
          <div className="md:hidden mb-4">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger>
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025].map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={holidayModifiers}
            modifiersStyles={{
              holiday: { backgroundColor: '#fee2e2' },
            }}
            className="rounded-md border"
          />

          {/* Mobile view of holidays */}
          <div className="mt-6 md:hidden">
            <HolidayList />
          </div>
        </CardContent>
      </Card>

      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Holidays</CardTitle>
          </CardHeader>
          <CardContent>
            <HolidayList />
          </CardContent>
        </Card>
      </div>

      <AddHolidayDialog />
    </div>
  );
}

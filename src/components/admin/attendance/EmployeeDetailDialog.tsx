// components/admin/attendance/EmployeeDetailDialog.tsx

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  format,
  startOfMonth,
  endOfMonth,
  isToday,
  isSameMonth,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { TimeEntryWithDate } from '@/types/attendance';
import { Clock, Calendar as CalendarIcon } from 'lucide-react';

interface EmployeeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | null;
  date: Date;
}

export function EmployeeDetailDialog({
  open,
  onOpenChange,
  employeeId,
  date,
}: EmployeeDetailDialogProps) {
  const [timeEntries, setTimeEntries] = useState<TimeEntryWithDate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(date);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && employeeId) {
      fetchTimeEntries();
    }
  }, [open, employeeId, selectedDate]);

  const fetchTimeEntries = async () => {
    if (!employeeId) return;

    try {
      setIsLoading(true);
      setError(null);
      const startDate = startOfMonth(selectedDate);
      const endDate = endOfMonth(selectedDate);

      const response = await fetch(
        `/api/admin/attendance/time-entries?` +
          new URLSearchParams({
            employeeId,
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
          }),
      );

      if (!response.ok) throw new Error('Failed to fetch time entries');

      // When fetching time entries
      const data = await response.json();
      const processedEntries: TimeEntryWithDate[] = data.map((entry: any) => ({
        ...entry,
        date: new Date(entry.date),
        startTime: entry.startTime ? new Date(entry.startTime) : null,
        endTime: entry.endTime ? new Date(entry.endTime) : null,
        isLate: entry.isLate || false,
        isDayOff: entry.isDayOff || false,
        regularHours: entry.regularHours || 0,
        overtimeHours: entry.overtimeHours || 0,
      }));
      setTimeEntries(processedEntries);
    } catch (error) {
      console.error('Error fetching time entries:', error);
      setError('Failed to load attendance records');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (entry: TimeEntryWithDate) => {
    if (entry.isDayOff) return <Badge variant="outline">Day Off</Badge>;
    if (!entry.startTime) return <Badge variant="destructive">Absent</Badge>;
    if (!entry.endTime) return <Badge variant="warning">Incomplete</Badge>;
    if (entry.isLate) return <Badge variant="warning">Late</Badge>;
    return <Badge variant="success">Present</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Employee Attendance Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Month Selector */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">
              {format(selectedDate, 'MMMM yyyy', { locale: th })}
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </Button>
          </div>

          {/* Calendar Grid */}
          <div className="border rounded-lg overflow-hidden">
            <div className="grid grid-cols-7 gap-px bg-muted">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div
                  key={day}
                  className="bg-background p-2 text-center font-medium"
                >
                  {day}
                </div>
              ))}

              {timeEntries.map((entry, i) => (
                <div
                  key={i}
                  className={`bg-background p-2 min-h-[100px] ${
                    isToday(entry.date) ? 'bg-muted/50' : ''
                  } ${
                    !isSameMonth(entry.date, selectedDate)
                      ? 'text-muted-foreground'
                      : ''
                  }`}
                >
                  <div className="text-sm font-medium mb-1">
                    {format(entry.date, 'd')}
                  </div>

                  {entry && (
                    <div className="space-y-1">
                      {getStatusBadge(entry)}
                      {entry.startTime && (
                        <div className="text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 inline-block mr-1" />
                          {format(new Date(entry.startTime), 'HH:mm')}
                          {entry.endTime &&
                            ` - ${format(new Date(entry.endTime), 'HH:mm')}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Regular Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {timeEntries.reduce(
                    (sum, entry) => sum + (entry.regularHours || 0),
                    0,
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Overtime Hours
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {timeEntries.reduce(
                    (sum, entry) => sum + (entry.overtimeHours || 0),
                    0,
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Late Days</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {timeEntries.filter((entry) => entry.isLate).length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Days Off</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {timeEntries.filter((entry) => entry.isDayOff).length}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

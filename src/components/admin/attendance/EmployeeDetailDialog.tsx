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
  parseISO,
} from 'date-fns';
import { th } from 'date-fns/locale';
import {
  DetailedTimeEntry,
  TimeEntry,
  TimeEntryWithDate,
} from '@/types/attendance';
import { Clock, Calendar as CalendarIcon, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  const [timeEntries, setTimeEntries] = useState<DetailedTimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<DetailedTimeEntry | null>(
    null,
  );
  const [showManualEntryDialog, setShowManualEntryDialog] = useState(false);

  useEffect(() => {
    if (open && employeeId) {
      fetchTimeEntries();
    }
  }, [open, employeeId, date]);

  const fetchTimeEntries = async () => {
    if (!employeeId) return;

    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        employeeId: employeeId,
        startDate: format(date, 'yyyy-MM-dd'),
        endDate: format(date, 'yyyy-MM-dd'),
      });

      const response = await fetch(
        `/api/admin/attendance/time-entries?${params}`,
      );

      if (!response.ok) throw new Error('Failed to fetch time entries');
      const data = await response.json();
      setTimeEntries(data.records);
    } catch (error) {
      console.error('Error fetching time entries:', error);
      setError('Failed to load attendance records');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualEntry = async (entryData: {
    date: string;
    checkInTime?: string;
    checkOutTime?: string;
    reason: string;
  }) => {
    try {
      if (!employeeId) return;

      const response = await fetch('/api/admin/attendance/manual-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...entryData,
          employeeId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create manual entry');
      }

      await fetchTimeEntries();
      setShowManualEntryDialog(false);
    } catch (error) {
      console.error('Error creating manual entry:', error);
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to create manual entry',
      );
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
          <DialogTitle>Attendance Details</DialogTitle>
        </DialogHeader>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            title="Regular Hours"
            value={timeEntries.reduce(
              (sum, entry) => sum + entry.regularHours,
              0,
            )}
          />
          <StatCard
            title="Overtime Hours"
            value={timeEntries.reduce(
              (sum, entry) => sum + entry.overtimeHours,
              0,
            )}
          />
          <StatCard
            title="Late Check-ins"
            value={timeEntries.filter((entry) => entry.isLateCheckIn).length}
          />
        </div>

        {/* Attendance List */}
        <div className="space-y-4">
          {timeEntries.map((entry) => (
            <Card key={entry.date} className="relative">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">
                      {format(parseISO(entry.date), 'EEEE, d MMMM yyyy', {
                        locale: th,
                      })}
                    </h3>
                    <div className="mt-2 space-y-1">
                      {entry.regularCheckInTime && (
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2 text-gray-400" />
                          <span>Check-in: {entry.regularCheckInTime}</span>
                          {entry.isLateCheckIn && (
                            <Badge variant="warning" className="ml-2">
                              Late
                            </Badge>
                          )}
                        </div>
                      )}
                      {entry.regularCheckOutTime && (
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2 text-gray-400" />
                          <span>Check-out: {entry.regularCheckOutTime}</span>
                          {entry.isLateCheckOut && (
                            <Badge variant="warning" className="ml-2">
                              Late
                            </Badge>
                          )}
                        </div>
                      )}
                      {entry.leave && (
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                          <span>{entry.leave.type}</span>
                          <Badge className="ml-2">{entry.leave.status}</Badge>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Manual Entry Button */}
                  {entry.canEditManually && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedEntry(entry);
                        setShowManualEntryDialog(true);
                      }}
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Manual Entry Dialog */}
        {showManualEntryDialog && selectedEntry && (
          <Dialog
            open={showManualEntryDialog}
            onOpenChange={setShowManualEntryDialog}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Manual Entry</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleManualEntry({
                    date: selectedEntry.date,
                    checkInTime:
                      (formData.get('checkInTime') as string) || undefined,
                    checkOutTime:
                      (formData.get('checkOutTime') as string) || undefined,
                    reason: formData.get('reason') as string,
                  });
                }}
              >
                <div className="space-y-4">
                  <div>
                    <Label>Check-in Time</Label>
                    <Input
                      type="time"
                      name="checkInTime"
                      defaultValue={
                        selectedEntry.regularCheckInTime || undefined
                      }
                    />
                  </div>
                  <div>
                    <Label>Check-out Time</Label>
                    <Input
                      type="time"
                      name="checkOutTime"
                      defaultValue={
                        selectedEntry.regularCheckOutTime || undefined
                      }
                    />
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Input
                      name="reason"
                      placeholder="Enter reason for manual entry"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowManualEntryDialog(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Save Changes</Button>
                  </div>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}

        {/* Error State */}
        {error && (
          <div className="flex items-center gap-2 text-red-500 mt-4">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && timeEntries.length === 0 && (
          <div className="text-center py-8">
            <Clock className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No Records Found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              No attendance records found for this period
            </p>
          </div>
        )}

        {/* PayPeriod Summary */}
        <div className="border-t mt-6 pt-6">
          <h4 className="font-medium mb-4">Pay Period Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <SummaryItem
              label="Regular Hours"
              value={`${timeEntries.reduce((sum, entry) => sum + entry.regularHours, 0)} hrs`}
            />
            <SummaryItem
              label="Overtime Hours"
              value={`${timeEntries.reduce((sum, entry) => sum + entry.overtimeHours, 0)} hrs`}
            />
            <SummaryItem
              label="Late Days"
              value={timeEntries
                .filter((entry) => entry.isLateCheckIn)
                .length.toString()}
            />
            <SummaryItem
              label="Leave Days"
              value={timeEntries
                .filter((entry) => entry.leave)
                .length.toString()}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SummaryItemProps {
  label: string;
  value: string;
}

function SummaryItem({ label, value }: SummaryItemProps) {
  return (
    <div className="bg-gray-50 p-3 rounded">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-lg font-medium">{value}</div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: number;
}

function StatCard({ title, value }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

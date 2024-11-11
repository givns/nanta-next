import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, eachDayOfInterval, isSameDay } from 'date-fns';
import { th } from 'date-fns/locale';
import { DetailedTimeEntry } from '@/types/attendance';
import {
  Clock,
  Calendar as CalendarIcon,
  AlertCircle,
  Loader2,
  Plus,
} from 'lucide-react';
import { ManualEntryDialog } from './ManualEntryDialog';
import { PayrollUtils } from '@/utils/payrollUtils';
import { PayrollPeriodSelector } from '@/components/payroll/PayrollPeriodSelector';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { useLiff } from '@/contexts/LiffContext';
import DashboardSkeleton from '@/components/dashboard/DashboardSkeleton';

interface ManualEntryData {
  employeeId: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  reason: string;
  reasonType: 'correction' | 'missing' | 'system_error' | 'other';
}

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
  const {
    user,
    isLoading: authLoading,
    isAuthorized,
  } = useAuth({
    required: true,
    requiredRoles: ['Admin', 'SuperAdmin'],
  });

  const { lineUserId } = useLiff();
  const [timeEntries, setTimeEntries] = useState<DetailedTimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showManualEntryDialog, setShowManualEntryDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<DetailedTimeEntry | null>(
    null,
  );
  const [currentPeriod, setCurrentPeriod] = useState(() => {
    const periods = PayrollUtils.generatePayrollPeriods();
    return periods.find((p) => p.isCurrentPeriod)?.value || periods[0].value;
  });

  useEffect(() => {
    if (open && employeeId) {
      fetchTimeEntries();
    }
  }, [open, employeeId, currentPeriod]);

  const fetchTimeEntries = async () => {
    if (!open || !employeeId || !lineUserId) return;

    try {
      setIsLoading(true);
      setError(null);

      const periodRange = PayrollUtils.parsePeriodValue(currentPeriod);
      if (!periodRange) {
        throw new Error('Invalid period selected');
      }

      const params = new URLSearchParams({
        employeeId: employeeId,
        startDate: PayrollUtils.formatDateForAPI(periodRange.startDate),
        endDate: PayrollUtils.formatDateForAPI(periodRange.endDate),
      });

      const response = await fetch(
        `/api/admin/attendance/time-entries?${params}`,
        {
          headers: {
            'x-line-userid': lineUserId,
          },
        },
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

  const handleManualEntry = async (
    data: Omit<ManualEntryData, 'employeeId'>,
  ) => {
    try {
      if (!employeeId || !lineUserId) return;

      const entryData: ManualEntryData = {
        ...data,
        employeeId,
      };

      const response = await fetch('/api/admin/attendance/manual-entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-userid': lineUserId, // Add this header
        },
        body: JSON.stringify(entryData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create manual entry');
      }

      await fetchTimeEntries();
      setShowManualEntryDialog(false);
      setSelectedEntry(null);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : 'Failed to create manual entry',
      );
      throw error;
    }
  };

  if (authLoading) {
    return <DashboardSkeleton />;
  }

  // Handle unauthorized access
  if (!isAuthorized || !user) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access the payroll system.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Attendance Details</DialogTitle>
          <DialogDescription>
            View and manage attendance records for the selected period
          </DialogDescription>
          <div className="mt-2">
            <PayrollPeriodSelector
              currentValue={currentPeriod}
              onChange={(value) => {
                setCurrentPeriod(value);
                setError(null);
              }}
            />
          </div>
        </DialogHeader>

        {/* Add New Entry Button */}
        <div className="mb-4">
          <Button
            onClick={() => {
              setSelectedEntry(null);
              setShowManualEntryDialog(true);
            }}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Missing Attendance
          </Button>
        </div>

        {/* Attendance Cards List */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          {timeEntries.map((entry) => (
            <Card key={entry.date} className="relative">
              <CardHeader className="p-4 pb-2">
                <div className="flex justify-between items-center">
                  <h3 className="font-medium">
                    {format(parseISO(entry.date), 'EEEE, d MMMM yyyy', {
                      locale: th,
                    })}
                  </h3>
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
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-gray-500">Check In</div>
                    <div className="flex items-center mt-1">
                      {entry.regularCheckInTime ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 text-gray-400" />
                          <span>{entry.regularCheckInTime}</span>
                          {entry.isLateCheckIn && (
                            <Badge variant="warning" className="ml-2">
                              Late
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500">Check Out</div>
                    <div className="flex items-center mt-1">
                      {entry.regularCheckOutTime ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 text-gray-400" />
                          <span>{entry.regularCheckOutTime}</span>
                          {entry.isLateCheckOut && (
                            <Badge variant="warning" className="ml-2">
                              Late
                            </Badge>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-gray-500">Hours</div>
                    <div className="flex items-center mt-1">
                      <span>{entry.regularHours.toFixed(1)}h</span>
                      {entry.overtimeHours > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          +{entry.overtimeHours.toFixed(1)}h OT
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {entry.leave && (
                  <div className="mt-3 flex items-center text-sm">
                    <CalendarIcon className="h-4 w-4 mr-2 text-gray-400" />
                    <span>{entry.leave.type}</span>
                    <Badge className="ml-2">{entry.leave.status}</Badge>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {timeEntries.length === 0 && !isLoading && (
            <div className="text-center py-8 text-gray-500">
              No attendance records found for this period
            </div>
          )}
        </div>

        {/* Manual Entry Dialog - Conditionally rendered with different props */}
        {showManualEntryDialog && (
          <ManualEntryDialog
            entry={
              selectedEntry
                ? selectedEntry
                : { date: format(new Date(), 'yyyy-MM-dd') }
            }
            isNewEntry={!selectedEntry}
            onClose={() => {
              setShowManualEntryDialog(false);
              setSelectedEntry(null);
            }}
            onSave={handleManualEntry}
          />
        )}

        {/* Error and Loading States */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

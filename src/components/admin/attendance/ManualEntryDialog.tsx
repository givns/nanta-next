//components/ManualEntryDialog.tsx

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { format, parseISO, isBefore, isToday, set } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
import { DetailedTimeEntry, ManualEntryFormData } from '@/types/attendance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PeriodType } from '@prisma/client';

const formSchema = z
  .object({
    date: z.string(),
    periodType: z.nativeEnum(PeriodType), // Changed from entryType to periodType
    checkInTime: z.string().optional(),
    checkOutTime: z.string().optional(),
    reasonType: z.enum(['correction', 'missing', 'system_error', 'other']),
    reason: z.string().min(1, 'Reason is required'),
    overtimeStartTime: z.string().optional(),
    overtimeEndTime: z.string().optional(),
    overtimeRequestId: z.string().optional(),
  })
  .refine((data) => data.checkInTime || data.checkOutTime, {
    message: 'At least one time must be entered',
    path: ['checkInTime'],
  })
  .refine(
    (data) => {
      // Add validation for overtime entries
      if (data.periodType === PeriodType.OVERTIME) {
        return (
          !!data.overtimeStartTime &&
          !!data.overtimeEndTime &&
          !!data.overtimeRequestId
        );
      }
      return true;
    },
    {
      message:
        'Overtime entries require start time, end time, and an approved overtime request',
      path: ['overtimeStartTime'],
    },
  );

type FormData = z.infer<typeof formSchema>;

interface ManualEntryDialogProps {
  entry: Partial<DetailedTimeEntry> & {
    date: string;
    overtimeRequest?: {
      id: string;
      startTime: string;
      endTime: string;
    } | null;
  };
  isNewEntry?: boolean;
  onClose: () => void;
  onSave: (data: ManualEntryFormData) => Promise<void>;
}

const reasonTypes = [
  { value: 'missing', label: 'Missing Entry' },
  { value: 'correction', label: 'Time Correction' },
  { value: 'system_error', label: 'System Error' },
  { value: 'other', label: 'Other' },
];

export function ManualEntryDialog({
  entry,
  isNewEntry = false,
  onClose,
  onSave,
}: ManualEntryDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(parseISO(entry.date));
  const [dateError, setDateError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: entry.date,
      periodType: entry.overtimeRequest
        ? PeriodType.OVERTIME
        : PeriodType.REGULAR, // Using enum values
      checkInTime: entry.CheckInTime || '',
      checkOutTime: entry.CheckOutTime || '',
      reasonType: 'missing' as const,
      reason: '',
      overtimeStartTime: entry.overtimeRequest
        ? entry.overtimeRequest.startTime
        : '',
      overtimeEndTime: entry.overtimeRequest
        ? entry.overtimeRequest.endTime
        : '',
      overtimeRequestId: entry.overtimeRequest?.id || '',
    },
  });

  const periodType = form.watch('periodType'); // Changed from entryType
  const isOvertimeEntry = periodType === PeriodType.OVERTIME;
  const overtimeBounds = entry.overtimeRequest
    ? {
        start: entry.overtimeRequest.startTime,
        end: entry.overtimeRequest.endTime,
      }
    : null;

  // Validate time entries against overtime bounds
  const validateTime = (time: string, isStart: boolean): boolean => {
    if (!isOvertimeEntry || !overtimeBounds) return true;

    const [hours, minutes] = time.split(':').map(Number);
    const timeDate = set(selectedDate, {
      hours,
      minutes,
      seconds: 0,
      milliseconds: 0,
    });

    const boundTime = isStart
      ? parseISO(
          `${format(selectedDate, 'yyyy-MM-dd')}T${overtimeBounds.start}`,
        )
      : parseISO(`${format(selectedDate, 'yyyy-MM-dd')}T${overtimeBounds.end}`);

    return isStart ? timeDate >= boundTime : timeDate <= boundTime;
  };

  // Use useEffect to update form when selectedDate changes
  useEffect(() => {
    form.setValue('date', format(selectedDate, 'yyyy-MM-dd'));
  }, [selectedDate, form]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    // Clear any previous errors
    setDateError(null);

    // Check if date is in the future
    if (isBefore(date, new Date()) || isToday(date)) {
      console.log('Date selected:', format(date, 'yyyy-MM-dd')); // Debug log
      setSelectedDate(date);
    } else {
      setDateError('Cannot select future dates');
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      setIsLoading(true);

      // Ensure the data matches ManualEntryFormData
      const formData: ManualEntryFormData = {
        date: data.date,
        periodType: data.periodType,
        timeWindow: {
          start: data.checkInTime,
          end: data.checkOutTime,
        },
        metadata: {
          reasonType: data.reasonType,
          reason: data.reason,
          overtimeId: data.overtimeRequestId,
        },
      };

      await onSave(formData);
      onClose();
    } catch (error) {
      console.error('Error saving manual entry:', error);
      form.setError('root', {
        type: 'manual',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save attendance record',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[500px] w-[calc(100%-2rem)] p-6">
        <DialogHeader>
          <DialogTitle>
            {isNewEntry ? 'Add Missing Attendance' : 'Edit Attendance Record'}
          </DialogTitle>
          <DialogDescription>
            {isOvertimeEntry
              ? 'Enter overtime attendance details within approved overtime period'
              : 'Enter regular attendance details'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Date Selection */}
            <FormField
              control={form.control}
              name="date"
              render={() => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  {isNewEntry ? (
                    <>
                      {/* Display selected date */}
                      <div className="p-2 mb-2 border rounded-md bg-muted">
                        {format(selectedDate, 'EEEE, d MMMM yyyy', {
                          locale: th,
                        })}
                      </div>
                      {/* Calendar */}
                      <div className="border rounded-md">
                        <Calendar
                          mode="single"
                          selected={selectedDate}
                          onSelect={handleDateSelect}
                          disabled={(date) => {
                            // Disable future dates and dates before payroll period start
                            const now = new Date();
                            function subtractMonths(
                              now: Date,
                              arg1: number,
                            ): any {
                              throw new Error('Function not implemented.');
                            }

                            return (
                              date > now ||
                              isBefore(date, subtractMonths(now, 1))
                            );
                          }}
                          className="w-full"
                          initialFocus
                        />
                      </div>
                    </>
                  ) : (
                    <div className="p-2 border rounded-md bg-muted">
                      {format(selectedDate, 'EEEE, d MMMM yyyy', {
                        locale: th,
                      })}
                    </div>
                  )}
                  {dateError && (
                    <p className="text-sm font-medium text-destructive mt-2">
                      {dateError}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Period Type */}
            <FormField
              control={form.control}
              name="periodType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Period Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={!entry.overtimeRequest}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select period type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={PeriodType.REGULAR}>
                        Regular Hours
                      </SelectItem>
                      {entry.overtimeRequest && (
                        <SelectItem value={PeriodType.OVERTIME}>
                          Overtime Hours
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {isOvertimeEntry && overtimeBounds && (
                    <p className="text-sm text-muted-foreground">
                      Approved overtime period: {overtimeBounds.start} -{' '}
                      {overtimeBounds.end}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time Inputs with Period Context */}
            {isOvertimeEntry ? (
              <div className="space-y-4">
                {/* Overtime Period Info */}
                {overtimeBounds && (
                  <div className="p-2 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-600">
                      Approved overtime period: {overtimeBounds.start} -{' '}
                      {overtimeBounds.end}
                    </p>
                  </div>
                )}

                {/* Overtime Time Entries */}
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="overtimeStartTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Overtime Start</FormLabel>
                        <div className="relative">
                          <Clock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <FormControl>
                            <Input
                              type="time"
                              className="pl-9"
                              {...field}
                              min={overtimeBounds?.start}
                              max={overtimeBounds?.end}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="overtimeEndTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Overtime End</FormLabel>
                        <div className="relative">
                          <Clock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                          <FormControl>
                            <Input
                              type="time"
                              className="pl-9"
                              {...field}
                              min={overtimeBounds?.start}
                              max={overtimeBounds?.end}
                            />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Hidden field for overtime request ID */}
                <FormField
                  control={form.control}
                  name="overtimeRequestId"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormControl>
                        <Input
                          type="hidden"
                          {...field}
                          value={entry.overtimeRequest?.id || ''}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              // Regular Time Entries
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="checkInTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check In Time</FormLabel>
                      <div className="relative">
                        <Clock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <FormControl>
                          <Input type="time" className="pl-9" {...field} />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="checkOutTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check Out Time</FormLabel>
                      <div className="relative">
                        <Clock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <FormControl>
                          <Input type="time" className="pl-9" {...field} />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Reason Fields */}
            <FormField
              control={form.control}
              name="reasonType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {reasonTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Enter reason for manual entry"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Form Error */}
            {form.formState.errors.root && (
              <Alert variant="destructive">
                <AlertDescription>
                  {form.formState.errors.root.message}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

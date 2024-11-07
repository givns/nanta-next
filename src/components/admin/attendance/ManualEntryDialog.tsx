import { useState } from 'react';
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
import { format, parseISO, isBefore, isToday } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
import { DetailedTimeEntry } from '@/types/attendance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const formSchema = z.object({
  date: z.string(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  reasonType: z.enum(['correction', 'missing', 'system_error', 'other']),
  reason: z.string().min(1, 'Reason is required'),
});

type FormData = z.infer<typeof formSchema>;

interface ManualEntryDialogProps {
  entry: Partial<DetailedTimeEntry> & { date: string };
  isNewEntry?: boolean;
  onClose: () => void;
  onSave: (data: FormData) => Promise<void>;
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

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: entry.date,
      checkInTime: entry.regularCheckInTime || '',
      checkOutTime: entry.regularCheckOutTime || '',
      reasonType: 'missing',
      reason: '',
    },
  });

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;

    // Clear any previous errors
    setDateError(null);

    // Validate the selected date
    if (isBefore(date, new Date()) || isToday(date)) {
      setSelectedDate(date);
      form.setValue('date', format(date, 'yyyy-MM-dd'));

      // Reset time fields when date changes
      form.setValue('checkInTime', '');
      form.setValue('checkOutTime', '');
    } else {
      setDateError('Cannot select future dates');
    }
  };

  const onSubmit = async (data: FormData) => {
    try {
      if (!data.checkInTime && !data.checkOutTime) {
        form.setError('checkInTime', {
          message: 'At least one time must be entered',
        });
        return;
      }

      setIsLoading(true);
      await onSave({
        ...data,
        date: format(selectedDate, 'yyyy-MM-dd'),
      });
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
            {isNewEntry
              ? 'Select a date and enter attendance details'
              : 'Modify the existing attendance record'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Date Field */}
            <FormField
              control={form.control}
              name="date"
              render={() => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  {isNewEntry ? (
                    <div className="border rounded-md p-0">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                        disabled={(date) =>
                          isBefore(date, new Date()) === false
                        }
                        classNames={{
                          root: 'w-full',
                          months:
                            'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
                          head_cell: 'w-9 font-normal text-muted-foreground',
                          cell: cn(
                            'h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20',
                          ),
                          day: cn(
                            'h-9 w-9 p-0 font-normal',
                            'hover:bg-accent hover:text-accent-foreground',
                          ),
                          day_range_end: 'day-range-end',
                          day_selected:
                            'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
                          day_today: 'bg-accent text-accent-foreground',
                          day_outside:
                            'day-outside text-muted-foreground opacity-50',
                          nav_button:
                            'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
                        }}
                      />
                    </div>
                  ) : (
                    <div className="p-2 border rounded-md bg-muted">
                      {format(selectedDate, 'EEEE, d MMMM yyyy', {
                        locale: th,
                      })}
                    </div>
                  )}
                  {dateError && (
                    <p className="text-sm text-destructive">{dateError}</p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time Inputs */}
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

            {/* Reason Type */}
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

            {/* Reason */}
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

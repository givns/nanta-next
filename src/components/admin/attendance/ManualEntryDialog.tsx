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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
import { DailyAttendanceResponse, DetailedTimeEntry } from '@/types/attendance';

// Form validation schema
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
  const [selectedRecord, setSelectedRecord] =
    useState<DailyAttendanceResponse | null>(null);

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

  const onSubmit = async (data: FormData) => {
    try {
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
        message: 'Failed to save attendance record',
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
              ? 'Add a new attendance record for a missing date'
              : 'Modify the existing attendance record'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Date Field - Different display for edit vs new */}
            <FormField
              control={form.control}
              name="date"
              render={() => (
                <FormItem className="flex flex-col">
                  <FormLabel>Date</FormLabel>
                  {isNewEntry ? (
                    // Calendar for new entries with improved responsiveness
                    <div className="border rounded-md p-0 w-full">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => {
                          if (date) {
                            setSelectedDate(date);
                            form.setValue('date', format(date, 'yyyy-MM-dd'));
                          }
                        }}
                        initialFocus
                        disabled={(date) => date > new Date()} // Prevent future dates
                        className="w-full"
                      />
                    </div>
                  ) : (
                    // Static date display for editing
                    <div className="p-2 border rounded-md bg-muted">
                      {format(selectedDate, 'EEEE, d MMMM yyyy', {
                        locale: th,
                      })}
                    </div>
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
              <p className="text-sm font-medium text-destructive">
                {form.formState.errors.root.message}
              </p>
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
              <Button
                type="submit"
                disabled={
                  isLoading ||
                  (!form.getValues('checkInTime') &&
                    !form.getValues('checkOutTime'))
                }
              >
                {isLoading ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

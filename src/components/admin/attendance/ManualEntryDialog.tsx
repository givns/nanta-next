import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
import { DetailedTimeEntry } from '@/types/attendance';
import { cn } from '@/lib/utils';

interface ManualEntryData {
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  reason: string;
  reasonType: 'correction' | 'missing' | 'system_error' | 'other';
}

interface ManualEntryDialogProps {
  entry: Partial<DetailedTimeEntry> & { date: string };
  onClose: () => void;
  onSave: (data: ManualEntryData) => Promise<void>;
}

export function ManualEntryDialog({
  entry,
  onClose,
  onSave,
}: ManualEntryDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(parseISO(entry.date));
  const [formData, setFormData] = useState<ManualEntryData>({
    date: entry.date,
    checkInTime: entry.regularCheckInTime || '',
    checkOutTime: entry.regularCheckOutTime || '',
    reason: '',
    reasonType: 'missing',
  });

  const reasonTypes = [
    { value: 'missing', label: 'Missing Entry' },
    { value: 'correction', label: 'Time Correction' },
    { value: 'system_error', label: 'System Error' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await onSave({
        ...formData,
        date: format(selectedDate, 'yyyy-MM-dd'),
      });
      onClose();
    } catch (error) {
      console.error('Error saving manual entry:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isExistingEntry = entry.regularCheckInTime || entry.regularCheckOutTime;

  return (
    <Dialog open onOpenChange={() => !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isExistingEntry
              ? 'Edit Attendance Record'
              : 'Add Attendance Record'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Date Selector */}
          <div className="grid gap-2">
            <FormLabel>Date</FormLabel>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    format(selectedDate, 'EEEE, d MMMM yyyy', { locale: th })
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setFormData((prev) => ({
                        ...prev,
                        date: format(date, 'yyyy-MM-dd'),
                      }));
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <FormLabel>Check In Time</FormLabel>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  type="time"
                  className="pl-9"
                  value={formData.checkInTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      checkInTime: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <FormLabel>Check Out Time</FormLabel>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  type="time"
                  className="pl-9"
                  value={formData.checkOutTime}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      checkOutTime: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Reason Type */}
          <div className="grid gap-2">
            <FormLabel>Reason Type</FormLabel>
            <Select
              value={formData.reasonType}
              onValueChange={(
                value: 'correction' | 'missing' | 'system_error' | 'other',
              ) => setFormData((prev) => ({ ...prev, reasonType: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reason type" />
              </SelectTrigger>
              <SelectContent>
                {reasonTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div className="grid gap-2">
            <FormLabel>Reason</FormLabel>
            <Input
              placeholder="Enter reason for manual entry"
              value={formData.reason}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, reason: e.target.value }))
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              isLoading ||
              !formData.reason ||
              (!formData.checkInTime && !formData.checkOutTime)
            }
          >
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

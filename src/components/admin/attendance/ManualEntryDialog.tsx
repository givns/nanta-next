// components/admin/attendance/ManualEntryDialog.tsx

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { DetailedTimeEntry } from '@/types/attendance';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface ManualEntryDialogProps {
  entry: DetailedTimeEntry;
  onClose: () => void;
  onSave: (data: ManualEntryData) => Promise<void>;
}

interface ManualEntryData {
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  reason: string;
  reasonType: 'correction' | 'missing' | 'system_error' | 'other';
}

const REASON_TYPES = [
  { value: 'correction', label: 'Time Correction' },
  { value: 'missing', label: 'Missing Check-in/out' },
  { value: 'system_error', label: 'System Error' },
  { value: 'other', label: 'Other' },
] as const;

export function ManualEntryDialog({
  entry,
  onClose,
  onSave,
}: ManualEntryDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonType, setReasonType] =
    useState<(typeof REASON_TYPES)[number]['value']>('correction');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);
      const checkInTime = formData.get('checkInTime') as string;
      const checkOutTime = formData.get('checkOutTime') as string;
      const reason = formData.get('reason') as string;

      // Validation
      if (!checkInTime && !checkOutTime) {
        throw new Error('Please provide at least one time entry');
      }
      if (!reason.trim()) {
        throw new Error('Please provide a reason for the manual entry');
      }

      // If only one time is provided, don't change the other
      const data: ManualEntryData = {
        date: entry.date,
        reason: reason.trim(),
        reasonType,
      };

      if (checkInTime !== entry.regularCheckInTime) {
        data.checkInTime = checkInTime || undefined;
      }
      if (checkOutTime !== entry.regularCheckOutTime) {
        data.checkOutTime = checkOutTime || undefined;
      }

      await onSave(data);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Failed to save manual entry',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manual Time Entry</DialogTitle>
          <div className="text-sm text-muted-foreground">
            {format(parseISO(entry.date), 'EEEE, d MMMM yyyy', { locale: th })}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="checkInTime">Check-in Time</Label>
                <Input
                  id="checkInTime"
                  name="checkInTime"
                  type="time"
                  defaultValue={entry.regularCheckInTime || undefined}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="checkOutTime">Check-out Time</Label>
                <Input
                  id="checkOutTime"
                  name="checkOutTime"
                  type="time"
                  defaultValue={entry.regularCheckOutTime || undefined}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason Type</Label>
              <Select
                value={reasonType}
                onValueChange={(value) =>
                  setReasonType(value as typeof reasonType)
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASON_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Detailed Reason</Label>
              <Input
                id="reason"
                name="reason"
                placeholder="Enter detailed reason for the manual entry"
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

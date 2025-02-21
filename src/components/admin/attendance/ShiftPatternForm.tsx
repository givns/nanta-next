// components/admin/attendance/ShiftPatternForm.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface ShiftPatternFormProps {
  initialData?: {
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  };
  onSubmit: (data: {
    shiftCode: string;
    name: string;
    startTime: string;
    endTime: string;
    workDays: number[];
  }) => void;
  onCancel: () => void;
}

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri

export default function ShiftPatternForm({
  initialData,
  onSubmit,
  onCancel,
}: ShiftPatternFormProps) {
  const [formData, setFormData] = useState({
    shiftCode: initialData?.shiftCode || '',
    name: initialData?.name || '',
    startTime: initialData?.startTime || '09:00',
    endTime: initialData?.endTime || '18:00',
    workDays: initialData?.workDays || DEFAULT_WORK_DAYS,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.shiftCode.trim()) {
      newErrors.shiftCode = 'Shift code is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Shift name is required';
    }
    if (!formData.startTime) {
      newErrors.startTime = 'Start time is required';
    }
    if (!formData.endTime) {
      newErrors.endTime = 'End time is required';
    }
    if (formData.workDays.length === 0) {
      newErrors.workDays = 'At least one work day must be selected';
    }

    // Time format validation
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(formData.startTime)) {
      newErrors.startTime = 'Invalid time format (HH:MM)';
    }
    if (!timeRegex.test(formData.endTime)) {
      newErrors.endTime = 'Invalid time format (HH:MM)';
    }

    // Compare start and end times
    if (formData.startTime && formData.endTime) {
      const start = new Date(`2000-01-01T${formData.startTime}`);
      const end = new Date(`2000-01-01T${formData.endTime}`);
      if (end <= start) {
        newErrors.endTime = 'End time must be after start time';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSubmit(formData);
    }
  };

  const toggleWorkDay = (day: number) => {
    setFormData((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(day)
        ? prev.workDays.filter((d) => d !== day)
        : [...prev.workDays, day].sort(),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Shift Code */}
        <div className="space-y-2">
          <Label htmlFor="shiftCode">Shift Code *</Label>
          <Input
            id="shiftCode"
            value={formData.shiftCode}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, shiftCode: e.target.value }))
            }
            placeholder="Enter shift code"
            disabled={!!initialData} // Disable editing for existing shifts
          />
          {errors.shiftCode && (
            <span className="text-sm text-red-500">{errors.shiftCode}</span>
          )}
        </div>

        {/* Shift Name */}
        <div className="space-y-2">
          <Label htmlFor="name">Shift Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="Enter shift name"
          />
          {errors.name && (
            <span className="text-sm text-red-500">{errors.name}</span>
          )}
        </div>

        {/* Start Time */}
        <div className="space-y-2">
          <Label htmlFor="startTime">Start Time *</Label>
          <Input
            id="startTime"
            type="time"
            value={formData.startTime}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, startTime: e.target.value }))
            }
          />
          {errors.startTime && (
            <span className="text-sm text-red-500">{errors.startTime}</span>
          )}
        </div>

        {/* End Time */}
        <div className="space-y-2">
          <Label htmlFor="endTime">End Time *</Label>
          <Input
            id="endTime"
            type="time"
            value={formData.endTime}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, endTime: e.target.value }))
            }
          />
          {errors.endTime && (
            <span className="text-sm text-red-500">{errors.endTime}</span>
          )}
        </div>
      </div>

      {/* Work Days */}
      <div className="space-y-2">
        <Label>Work Days *</Label>
        <div className="flex flex-wrap gap-4">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
            (day, index) => (
              <div key={day} className="flex items-center space-x-2">
                <Checkbox
                  id={`day-${index}`}
                  checked={formData.workDays.includes(index)}
                  onCheckedChange={() => toggleWorkDay(index)}
                />
                <Label htmlFor={`day-${index}`}>{day}</Label>
              </div>
            ),
          )}
        </div>
        {errors.workDays && (
          <span className="text-sm text-red-500">{errors.workDays}</span>
        )}
      </div>

      {Object.keys(errors).length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please fix the errors before submitting
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {initialData ? 'Update Shift Pattern' : 'Create Shift Pattern'}
        </Button>
      </div>
    </form>
  );
}

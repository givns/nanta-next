// components/admin/attendance/ShiftAdjustmentForm.tsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DateSelector } from './components/DateSelector';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

interface Department {
  id: string;
  name: string;
}

interface Shift {
  id: string;
  shiftCode: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface ShiftAdjustmentFormProps {
  departments: Department[];
  shifts: Shift[];
  onSubmit: (data: {
    type: 'individual' | 'department';
    employeeIds?: string[];
    departmentId?: string;
    shiftCode: string;
    date: string;
    reason: string;
  }) => void;
  onCancel: () => void;
}

export function ShiftAdjustmentForm({
  departments,
  shifts,
  onSubmit,
  onCancel,
}: ShiftAdjustmentFormProps) {
  const [adjustmentType, setAdjustmentType] = useState<
    'individual' | 'department'
  >('individual');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [employeeIds, setEmployeeIds] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [adjustmentDate, setAdjustmentDate] = useState(new Date());
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (adjustmentType === 'individual' && !employeeIds.trim()) {
      newErrors.employeeIds = 'Employee IDs are required';
    }

    if (adjustmentType === 'department' && !selectedDepartment) {
      newErrors.department = 'Department is required';
    }

    if (!selectedShift) {
      newErrors.shift = 'Shift is required';
    }

    if (!reason.trim()) {
      newErrors.reason = 'Reason is required';
    }

    if (!adjustmentDate) {
      newErrors.date = 'Date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    const data = {
      type: adjustmentType,
      ...(adjustmentType === 'individual'
        ? {
            employeeIds: employeeIds
              .split('\n')
              .map((id) => id.trim())
              .filter(Boolean),
          }
        : { departmentId: selectedDepartment }),
      shiftCode: selectedShift,
      date: adjustmentDate.toISOString(),
      reason: reason.trim(),
    };

    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Adjustment Type */}
      <div className="space-y-2">
        <Label>Adjustment Type</Label>
        <RadioGroup
          defaultValue={adjustmentType}
          onValueChange={(value) =>
            setAdjustmentType(value as 'individual' | 'department')
          }
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="individual" id="individual" />
            <Label htmlFor="individual">Individual</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="department" id="department" />
            <Label htmlFor="department">Department</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Employee/Department Selection */}
      {adjustmentType === 'individual' ? (
        <div className="space-y-2">
          <Label>Employee IDs (one per line)</Label>
          <Textarea
            value={employeeIds}
            onChange={(e) => setEmployeeIds(e.target.value)}
            placeholder="Enter employee IDs, one per line"
            className="h-32"
          />
          {errors.employeeIds && (
            <span className="text-sm text-red-500">{errors.employeeIds}</span>
          )}
          <p className="text-sm text-gray-500">
            Enter each employee ID on a new line
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Department</Label>
          <Select
            value={selectedDepartment}
            onValueChange={setSelectedDepartment}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((dept) => (
                <SelectItem key={dept.id} value={dept.id}>
                  {dept.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.department && (
            <span className="text-sm text-red-500">{errors.department}</span>
          )}
        </div>
      )}

      {/* Date Selection */}
      <div className="space-y-2">
        <Label>Adjustment Date</Label>
        <DateSelector
          date={adjustmentDate}
          onChange={(date) => setAdjustmentDate(date || new Date())}
        />
        {errors.date && (
          <span className="text-sm text-red-500">{errors.date}</span>
        )}
      </div>

      {/* Shift Selection */}
      <div className="space-y-2">
        <Label>New Shift</Label>
        <Select value={selectedShift} onValueChange={setSelectedShift}>
          <SelectTrigger>
            <SelectValue placeholder="Select shift" />
          </SelectTrigger>
          <SelectContent>
            {shifts.map((shift) => (
              <SelectItem key={shift.shiftCode} value={shift.shiftCode}>
                {shift.name} ({shift.startTime} - {shift.endTime})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.shift && (
          <span className="text-sm text-red-500">{errors.shift}</span>
        )}
      </div>

      {/* Reason */}
      <div className="space-y-2">
        <Label>Reason for Adjustment</Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Enter reason for shift adjustment"
          className="h-24"
        />
        {errors.reason && (
          <span className="text-sm text-red-500">{errors.reason}</span>
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

      {/* Form Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Create Adjustment</Button>
      </div>
    </form>
  );
}

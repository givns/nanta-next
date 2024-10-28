// components/admin/attendance/ShiftPatternManagement.tsx

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';

interface ShiftPattern {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  workDays: number[];
  description?: string;
}

export default function ShiftPatternManagement() {
  const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPattern, setEditingPattern] = useState<ShiftPattern | null>(
    null,
  );
  const { toast } = useToast();

  const weekDays = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      // Handle form submission
      const formData = new FormData(event.target as HTMLFormElement);
      const data = {
        name: formData.get('name'),
        code: formData.get('code'),
        startTime: formData.get('startTime'),
        endTime: formData.get('endTime'),
        workDays: weekDays
          .filter((_, index) => formData.get(`day-${index}`))
          .map((day) => day.value),
        description: formData.get('description'),
      };

      const response = await fetch('/api/admin/shifts/patterns', {
        method: editingPattern ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          id: editingPattern?.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to save shift pattern');

      toast({
        title: 'Success',
        description: `Shift pattern ${editingPattern ? 'updated' : 'created'} successfully`,
      });

      setShowDialog(false);
      setEditingPattern(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save shift pattern',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between">
            <CardTitle>Shift Patterns</CardTitle>
            <Button
              onClick={() => {
                setEditingPattern(null);
                setShowDialog(true);
              }}
            >
              Add Pattern
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {patterns.map((pattern) => (
              <Card key={pattern.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{pattern.name}</h3>
                      <p className="text-sm text-gray-500">
                        Code: {pattern.code}
                      </p>
                    </div>
                    <div className="space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingPattern(pattern);
                          setShowDialog(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={async () => {
                          // Handle delete
                          try {
                            const response = await fetch(
                              `/api/admin/shifts/patterns/${pattern.id}`,
                              {
                                method: 'DELETE',
                              },
                            );
                            if (!response.ok)
                              throw new Error('Failed to delete pattern');
                            toast({
                              title: 'Success',
                              description: 'Shift pattern deleted successfully',
                            });
                          } catch (error) {
                            toast({
                              title: 'Error',
                              description: 'Failed to delete shift pattern',
                              variant: 'destructive',
                            });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Hours: </span>
                      <span>
                        {pattern.startTime} - {pattern.endTime}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Work Days: </span>
                      <span>
                        {pattern.workDays
                          .map(
                            (day) =>
                              weekDays.find((d) => d.value === day)?.label,
                          )
                          .join(', ')}
                      </span>
                    </div>
                    {pattern.description && (
                      <div className="col-span-2">
                        <span className="text-gray-500">Description: </span>
                        <span>{pattern.description}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingPattern ? 'Edit Shift Pattern' : 'Create Shift Pattern'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Pattern Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editingPattern?.name}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Pattern Code</Label>
                <Input
                  id="code"
                  name="code"
                  defaultValue={editingPattern?.code}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time</Label>
                <Input
                  id="startTime"
                  name="startTime"
                  type="time"
                  defaultValue={editingPattern?.startTime}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End Time</Label>
                <Input
                  id="endTime"
                  name="endTime"
                  type="time"
                  defaultValue={editingPattern?.endTime}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Work Days</Label>
              <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                {weekDays.map((day, index) => (
                  <div key={day.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`day-${index}`}
                      name={`day-${index}`}
                      defaultChecked={editingPattern?.workDays.includes(
                        day.value,
                      )}
                    />
                    <Label htmlFor={`day-${index}`}>{day.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                name="description"
                defaultValue={editingPattern?.description}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit">
                {editingPattern ? 'Update' : 'Create'} Pattern
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// components/admin/leaves/holidays/HolidayList.tsx

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface Holiday {
  id: string;
  date: Date;
  name: string;
  localName: string;
  type: 'public' | 'company' | 'special';
}

export default function HolidayList() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const formData = new FormData(event.target as HTMLFormElement);
      const data = {
        date: formData.get('date'),
        name: formData.get('name'),
        localName: formData.get('localName'),
        type: formData.get('type'),
      };

      const response = await fetch('/api/admin/holidays', {
        method: editingHoliday ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...data,
          id: editingHoliday?.id,
        }),
      });

      if (!response.ok) throw new Error('Failed to save holiday');

      toast({
        title: 'Success',
        description: `Holiday ${editingHoliday ? 'updated' : 'created'} successfully`,
      });

      setShowDialog(false);
      setEditingHoliday(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save holiday',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Holiday List</CardTitle>
          <Button
            onClick={() => {
              setEditingHoliday(null);
              setShowDialog(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Holiday
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Input placeholder="Search holidays..." />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>ชื่อวันหยุด</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((holiday) => (
                <TableRow key={holiday.id}>
                  <TableCell>
                    {format(holiday.date, 'dd MMMM yyyy', { locale: th })}
                  </TableCell>
                  <TableCell>{holiday.name}</TableCell>
                  <TableCell>{holiday.localName}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        holiday.type === 'public'
                          ? 'default'
                          : holiday.type === 'company'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      {holiday.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingHoliday(holiday);
                        setShowDialog(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch(
                            `/api/admin/holidays/${holiday.id}`,
                            {
                              method: 'DELETE',
                            },
                          );
                          if (!response.ok)
                            throw new Error('Failed to delete holiday');
                          toast({
                            title: 'Success',
                            description: 'Holiday deleted successfully',
                          });
                        } catch (error) {
                          toast({
                            title: 'Error',
                            description: 'Failed to delete holiday',
                            variant: 'destructive',
                          });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingHoliday ? 'Edit Holiday' : 'Add Holiday'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Date</label>
                <Calendar
                  mode="single"
                  selected={editingHoliday?.date}
                  className="rounded-md border"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Name (English)</label>
                <Input
                  name="name"
                  defaultValue={editingHoliday?.name}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">ชื่อวันหยุด (ไทย)</label>
                <Input
                  name="localName"
                  defaultValue={editingHoliday?.localName}
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  name="type"
                  defaultValue={editingHoliday?.type || 'public'}
                  className="w-full p-2 border rounded"
                >
                  <option value="public">Public Holiday</option>
                  <option value="company">Company Holiday</option>
                  <option value="special">Special Holiday</option>
                </select>
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
                  {editingHoliday ? 'Update' : 'Add'} Holiday
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

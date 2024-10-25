import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar as CalendarIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NoWorkDay {
  id: string;
  date: string;
  reason?: string;
}

interface NoWorkDayManagementProps {
  noWorkDays: NoWorkDay[];
  onAddNoWorkDay: (date: Date, reason: string) => Promise<void>;
  onDeleteNoWorkDay: (id: string) => Promise<void>;
}

const NoWorkDayManagement: React.FC<NoWorkDayManagementProps> = ({
  noWorkDays,
  onAddNoWorkDay,
  onDeleteNoWorkDay,
}) => {
  const [newDate, setNewDate] = useState<Date | undefined>(undefined);
  const [newReason, setNewReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleAddNoWorkDay = async () => {
    if (!newDate) return;

    try {
      setIsSubmitting(true);
      await onAddNoWorkDay(newDate, newReason);
      setNewDate(undefined);
      setNewReason('');
      setIsCalendarOpen(false);
    } catch (error) {
      console.error('Failed to add no work day:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDeleteNoWorkDay(id);
    } catch (error) {
      console.error('Failed to delete no work day:', error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          จัดการวันหยุดพิเศษ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                วันที่
              </label>
              <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !newDate && 'text-muted-foreground',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newDate
                      ? format(newDate, 'PPP', { locale: th })
                      : 'เลือกวันที่'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newDate}
                    onSelect={setNewDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                เหตุผล
              </label>
              <Input
                placeholder="ระบุเหตุผล"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
              />
            </div>
            <Button
              onClick={handleAddNoWorkDay}
              disabled={!newDate || isSubmitting}
              className="w-full sm:w-auto"
            >
              <CalendarIcon className="w-4 h-4 mr-2" />
              เพิ่มวันหยุด
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>วันที่</TableHead>
                <TableHead>เหตุผล</TableHead>
                <TableHead className="w-[100px]">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {noWorkDays.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center text-muted-foreground"
                  >
                    ไม่มีข้อมูลวันหยุดพิเศษ
                  </TableCell>
                </TableRow>
              ) : (
                noWorkDays.map((day) => (
                  <TableRow key={day.id}>
                    <TableCell>
                      {format(new Date(day.date), 'EEEE d MMMM yyyy', {
                        locale: th,
                      })}
                    </TableCell>
                    <TableCell>{day.reason || '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(day.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default NoWorkDayManagement;

import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, AlertCircle } from 'lucide-react';
import {
  ShiftData,
  TimeEntry,
  RawTimeEntry,
  TimeEntryData,
  transformTimeEntry,
} from '../types/attendance';

interface DayRecord {
  key: string;
  date: Date;
  dayName: string;
  status: string;
  checkIn: string;
  checkOut: string;
  hours: string;
  entry: TimeEntry | null;
  isWorkDay: boolean;
}

interface AttendanceTableProps {
  timeEntries: TimeEntry[];
  shift: ShiftData;
  startDate: Date;
  endDate: Date;
  isLoading?: boolean;
}

export function useTimeEntries(employeeId: string) {
  const [timeEntries, setTimeEntries] = useState<TimeEntryData[]>([]);

  useEffect(() => {
    const fetchTimeEntries = async () => {
      try {
        const response = await fetch(
          `/api/time-entries?employeeId=${employeeId}`,
        );
        if (!response.ok) throw new Error('Failed to fetch time entries');

        const rawData: RawTimeEntry[] = await response.json();
        const transformedEntries = rawData.map(transformTimeEntry);
        setTimeEntries(transformedEntries);
      } catch (error) {
        console.error('Error fetching time entries:', error);
      }
    };

    if (employeeId) {
      fetchTimeEntries();
    }
  }, [employeeId]);

  return timeEntries;
}

const AttendanceTable: React.FC<AttendanceTableProps> = ({
  timeEntries,
  shift,
  startDate,
  endDate,
  isLoading = false,
}) => {
  const formatTime = (time: Date | string | null): string => {
    if (!time) return '-';
    return format(typeof time === 'string' ? new Date(time) : time, 'HH:mm');
  };

  // Transform data for table
  const prepareDataSource = (): DayRecord[] => {
    const allDays: DayRecord[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'yyyy-MM-dd');
      const entry =
        timeEntries.find(
          (t) => format(new Date(t.date), 'yyyy-MM-dd') === dateKey,
        ) || null;

      const isWorkDay =
        shift?.workDays?.includes(currentDate.getDay()) ?? false;

      allDays.push({
        key: dateKey,
        date: new Date(currentDate),
        dayName: format(currentDate, 'EEEE', { locale: th }),
        status: entry?.status || (isWorkDay ? 'absent' : 'day-off'),
        checkIn: entry?.startTime ? formatTime(entry.startTime) : '-',
        checkOut: entry?.endTime ? formatTime(entry.endTime) : '-',
        hours: entry
          ? `${entry.regularHours}${entry.overtimeHours > 0 ? ` (+${entry.overtimeHours})` : ''}`
          : '-',
        entry,
        isWorkDay,
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return allDays;
  };

  const getStatusBadge = (record: DayRecord) => {
    if (!record.entry) {
      return record.isWorkDay ? (
        <Badge variant="destructive">ขาดงาน</Badge>
      ) : (
        <Badge variant="secondary">วันหยุด</Badge>
      );
    }

    const badges = [];

    if (record.entry.status === 'in_progress') {
      badges.push(
        <Badge key="status" variant="warning">
          กำลังทำงาน
        </Badge>,
      );
    } else {
      badges.push(
        <Badge key="status" variant="success">
          เสร็จสิ้น
        </Badge>,
      );
    }

    if (record.entry.actualMinutesLate > 0) {
      badges.push(
        <Badge key="late" variant="destructive" className="ml-2">
          <AlertCircle className="mr-1 h-3 w-3" />
          {record.entry.isHalfDayLate ? 'สายครึ่งวัน' : 'สาย'}
        </Badge>,
      );
    }

    return <div className="flex flex-wrap gap-1">{badges}</div>;
  };

  if (isLoading) {
    return <AttendanceTableSkeleton />;
  }

  const records = prepareDataSource();

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>วันที่</TableHead>
            <TableHead>วัน</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>เวลาเข้า</TableHead>
            <TableHead>เวลาออก</TableHead>
            <TableHead className="text-right">ชั่วโมง</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.key}>
              <TableCell>{format(record.date, 'dd/MM/yyyy')}</TableCell>
              <TableCell>{record.dayName}</TableCell>
              <TableCell>{getStatusBadge(record)}</TableCell>
              <TableCell>
                {record.checkIn !== '-' ? (
                  <div className="flex items-center">
                    <Clock className="mr-1 h-4 w-4" />
                    {record.checkIn}
                  </div>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell>
                {record.checkOut !== '-' ? (
                  <div className="flex items-center">
                    <Clock className="mr-1 h-4 w-4" />
                    {record.checkOut}
                  </div>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="text-right">{record.hours}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const AttendanceTableSkeleton: React.FC = () => (
  <div className="rounded-md border">
    <div className="p-4">
      <div className="grid grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
      {[...Array(7)].map((_, i) => (
        <div key={i} className="mt-4 grid grid-cols-6 gap-4">
          {[...Array(6)].map((_, j) => (
            <Skeleton key={j} className="h-8 w-full" />
          ))}
        </div>
      ))}
    </div>
  </div>
);

export default AttendanceTable;

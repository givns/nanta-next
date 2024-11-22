import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';
import { DailyAttendanceRecord } from '@/types/attendance';

interface AttendanceCardProps {
  record: DailyAttendanceRecord;
  onView: () => void;
}

function formatTime(timeString: string | null | undefined): string {
  if (!timeString) return '-';

  try {
    // Check if timeString is already in HH:mm format
    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeString)) {
      return timeString;
    }

    // If it's a full ISO string, extract just the time part
    const timeMatch = timeString.match(/\d{2}:\d{2}/);
    if (timeMatch) {
      return timeMatch[0];
    }

    return '-';
  } catch (error) {
    console.error('Error formatting time:', error, timeString);
    return '-';
  }
}

export function AttendanceCard({ record, onView }: AttendanceCardProps) {
  const getStatusBadge = () => {
    if (record.leaveInfo) {
      return <Badge variant="secondary">{`On ${record.leaveInfo.type}`}</Badge>;
    }
    if (record.isDayOff) {
      return <Badge variant="outline">Day Off</Badge>;
    }
    if (!record.regularCheckInTime) {
      return <Badge variant="destructive">Absent</Badge>;
    }
    if (!record.regularCheckOutTime) {
      return <Badge variant="warning">Incomplete</Badge>;
    }
    if (record.isLateCheckIn || record.isLateCheckOut) {
      return <Badge variant="warning">Late</Badge>;
    }
    return <Badge variant="success">Present</Badge>;
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div>
            <div className="font-medium">{record.employeeName}</div>
            <div className="text-sm text-gray-500">
              {record.employeeId} · {record.departmentName}
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {record.shift && (
          <div className="mt-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <div>
              <span className="font-medium">{record.shift.name}</span>
              <span className="text-sm text-gray-500 ml-2">
                {formatTime(record.shift.startTime)} -{' '}
                {formatTime(record.shift.endTime)}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Check In</div>
            <div className="flex items-center gap-2">
              <span>{formatTime(record.regularCheckInTime)}</span>
              {record.isLateCheckIn && (
                <Badge variant="warning" className="h-5">
                  Late
                </Badge>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">Check Out</div>
            <div className="flex items-center gap-2">
              <span>{formatTime(record.regularCheckOutTime)}</span>
              {record.isLateCheckOut && (
                <Badge variant="warning" className="h-5">
                  Late
                </Badge>
              )}
            </div>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="mt-4 w-full"
          onClick={onView}
        >
          View Details
        </Button>
      </CardContent>
    </Card>
  );
}

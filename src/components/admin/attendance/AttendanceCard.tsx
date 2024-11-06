// components/admin/attendance/AttendanceCard.tsx

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { DailyAttendanceResponse } from '@/types/attendance';
import { Clock } from 'lucide-react';

interface AttendanceCardProps {
  record: DailyAttendanceResponse;
  onView: () => void;
}

export function AttendanceCard({ record, onView }: AttendanceCardProps) {
  const getStatusBadge = () => {
    if (record.leaveInfo) {
      return <Badge variant="secondary">{`On ${record.leaveInfo.type}`}</Badge>;
    }
    if (record.isDayOff) {
      return <Badge variant="outline">Day Off</Badge>;
    }
    if (!record.attendance?.regularCheckInTime) {
      return <Badge variant="destructive">Absent</Badge>;
    }
    if (!record.attendance.regularCheckOutTime) {
      return <Badge variant="warning">Incomplete</Badge>;
    }
    if (record.attendance.isLateCheckIn || record.attendance.isLateCheckOut) {
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
                {record.shift.startTime} - {record.shift.endTime}
              </span>
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500">Check In</div>
            <div className="flex items-center gap-2">
              {record.attendance?.regularCheckInTime ? (
                <>
                  {format(
                    parseISO(record.attendance.regularCheckInTime),
                    'HH:mm',
                  )}
                  {record.attendance.isLateCheckIn && (
                    <Badge variant="warning" className="h-5">
                      Late
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">Check Out</div>
            <div className="flex items-center gap-2">
              {record.attendance?.regularCheckOutTime ? (
                <>
                  {format(
                    parseISO(record.attendance.regularCheckOutTime),
                    'HH:mm',
                  )}
                  {record.attendance.isLateCheckOut && (
                    <Badge variant="warning" className="h-5">
                      Late
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-gray-400">-</span>
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

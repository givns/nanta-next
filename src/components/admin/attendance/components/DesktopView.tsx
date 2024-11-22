// components/admin/attendance/components/DesktopView.tsx
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DailyAttendanceRecord } from '@/types/attendance';
import { AttendanceTime } from './AttendanceTime';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/admin/attendance/components/EmptyState';

interface DesktopViewProps {
  records: DailyAttendanceRecord[];
  onRecordSelect: (record: DailyAttendanceRecord) => void;
  onEditRecord: (e: React.MouseEvent, record: DailyAttendanceRecord) => void;
}

const getStatusBadge = (record: DailyAttendanceRecord) => {
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

export function DesktopView({
  records,
  onRecordSelect,
  onEditRecord,
}: DesktopViewProps) {
  return (
    <div className="hidden md:block">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Check In</TableHead>
              <TableHead>Check Out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow
                key={record.employeeId}
                className="cursor-pointer hover:bg-gray-50 group"
                onClick={() => onRecordSelect(record)}
              >
                <TableCell>
                  <div className="font-medium">{record.employeeName}</div>
                  <div className="text-sm text-gray-500">
                    {record.employeeId}
                  </div>
                </TableCell>
                <TableCell>{record.departmentName}</TableCell>
                <TableCell>
                  {record.shift ? (
                    <div>
                      <div className="font-medium">{record.shift.name}</div>
                      <div className="text-sm text-gray-500">
                        {record.shift.startTime} - {record.shift.endTime}
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">No shift assigned</span>
                  )}
                </TableCell>
                <TableCell>
                  <AttendanceTime
                    time={record.regularCheckInTime}
                    isLate={record.isLateCheckIn}
                  />
                </TableCell>
                <TableCell>
                  <AttendanceTime
                    time={record.regularCheckOutTime}
                    isLate={record.isLateCheckOut}
                  />
                </TableCell>
                <TableCell>{getStatusBadge(record)}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => onEditRecord(e, record)}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {records.length === 0 && <EmptyState />}
    </div>
  );
}

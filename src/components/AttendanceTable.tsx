// components/AttendanceTable.tsx
import React from 'react';
import { ShiftData, ProcessedAttendance } from '@/types/user';
import moment from 'moment-timezone';

interface AttendanceTableProps {
  attendanceData: ProcessedAttendance[];
  shift: ShiftData;
}

const AttendanceTable: React.FC<AttendanceTableProps> = ({
  attendanceData,
  shift,
}) => {
  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th>Date</th>
          <th>Status</th>
          <th>Check In</th>
          <th>Check Out</th>
          <th>Flags</th>
          <th>Overtime</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {attendanceData.map((attendance, index) => (
          <tr key={index}>
            <td>{moment(attendance.date).format('YYYY-MM-DD')}</td>
            <td>{attendance.status}</td>
            <td>{attendance.checkIn || '-'}</td>
            <td>{attendance.checkOut || '-'}</td>
            <td>
              {attendance.isEarlyCheckIn && (
                <span className="text-blue-500">Early </span>
              )}
              {attendance.isLateCheckIn && (
                <span className="text-red-500">Late In </span>
              )}
              {attendance.isLateCheckOut && (
                <span className="text-green-500">Late Out</span>
              )}
            </td>
            <td>
              {attendance.overtimeHours
                ? `${attendance.overtimeHours} hours`
                : '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default AttendanceTable;

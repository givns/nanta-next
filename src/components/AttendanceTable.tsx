import React from 'react';
import moment from 'moment-timezone';
import { ProcessedAttendance, ShiftData } from '../types/attendance';

interface AttendanceTableProps {
  attendanceData: ProcessedAttendance[];
  shift: ShiftData;
  startDate: moment.Moment;
  endDate: moment.Moment;
}

const AttendanceTable: React.FC<AttendanceTableProps> = ({
  attendanceData,
  shift,
  startDate,
  endDate,
}) => {
  const allDays = [];
  let currentDay = startDate.clone();

  while (currentDay.isSameOrBefore(endDate)) {
    const attendanceForDay = attendanceData.find((a) =>
      moment(a.date).isSame(currentDay, 'day'),
    );
    allDays.push({
      date: currentDay.clone(),
      attendance: attendanceForDay || {
        date: currentDay.toDate(),
        status: shift?.workDays?.includes(currentDay.day()) ? 'absent' : 'off',
      },
    });
    currentDay.add(1, 'day');
  }

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead>
        <tr>
          <th>Date</th>
          <th>Status</th>
          <th>Check In</th>
          <th>Check Out</th>
        </tr>
      </thead>
      <tbody>
        {allDays.map(({ date, attendance }) => (
          <tr key={date.format('YYYY-MM-DD')}>
            <td>{date.format('DD/MM/YYYY')}</td>
            <td>{attendance.status}</td>
            <td>
              {('checkIn' in attendance && (attendance.checkIn as string)) ||
                '-'}
            </td>
            <td>
              {('checkOut' in attendance && (attendance.checkOut as string)) ||
                '-'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default AttendanceTable;

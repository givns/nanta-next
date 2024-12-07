import React, { useState, useEffect } from 'react';
import { isWithinInterval, differenceInMinutes, format } from 'date-fns';
import {
  ShiftData,
  CurrentPeriodInfo,
  LatestAttendance,
} from '@/types/attendance';

interface AttendanceProgressProps {
  effectiveShift: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  latestAttendance?: LatestAttendance | null;
  approvedOvertime?: OvertimeInfoUI | null;
}
interface OvertimeInfoUI {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string;
}

const AttendanceProgress: React.FC<AttendanceProgressProps> = ({
  effectiveShift,
  currentPeriod,
  latestAttendance,
  approvedOvertime,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!effectiveShift) return null;

  const shiftStart = new Date(
    `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
  );
  const shiftEnd = new Date(
    `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.endTime}`,
  );
  const totalShiftMinutes = differenceInMinutes(shiftEnd, shiftStart);

  const checkInTime = latestAttendance?.regularCheckInTime;
  const checkOutTime = latestAttendance?.regularCheckOutTime;

  const getProgressWidth = () => {
    if (!checkInTime) {
      // No attendance - fill with red to current time
      const elapsed = differenceInMinutes(currentTime, shiftStart);
      const progress = Math.min(100, (elapsed / totalShiftMinutes) * 100);
      return `${progress}%`;
    }

    if (checkOutTime) {
      // Completed attendance
      return '100%';
    }

    // In progress - fill with blue to current time
    const elapsed = differenceInMinutes(currentTime, shiftStart);
    const progress = Math.min(100, (elapsed / totalShiftMinutes) * 100);
    return `${progress}%`;
  };

  const getProgressColor = () => {
    if (!checkInTime) return 'bg-red-300';
    if (checkOutTime) return 'bg-green-500';
    return 'bg-blue-500';
  };

  return (
    <div className="w-full bg-white p-4 rounded-lg shadow-md">
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute h-full transition-all duration-300 ${getProgressColor()}`}
          style={{ width: getProgressWidth() }}
        >
          {checkInTime && (
            <div
              className="absolute w-2 h-full bg-green-600"
              style={{
                left: `${(differenceInMinutes(new Date(checkInTime), shiftStart) / totalShiftMinutes) * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      <div className="flex justify-between text-xs text-gray-500 mt-2">
        <span>{format(shiftStart, 'HH:mm')}</span>
        <span>{format(shiftEnd, 'HH:mm')}</span>
      </div>

      {checkInTime && (
        <div className="flex items-center space-x-2 text-sm mt-2">
          <div className="w-2 h-2 rounded-full bg-green-500"></div>
          <span>Checked in: {format(new Date(checkInTime), 'HH:mm')}</span>
        </div>
      )}

      {checkOutTime && (
        <div className="flex items-center space-x-2 text-sm mt-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isWithinInterval(new Date(checkOutTime), {
                start: shiftStart,
                end: shiftEnd,
              })
                ? 'bg-green-500'
                : 'bg-red-500'
            }`}
          />
          <span>Checked out: {format(new Date(checkOutTime), 'HH:mm')}</span>
        </div>
      )}

      {approvedOvertime && (
        <div className="mt-4">
          <h4 className="text-gray-500 font-medium">Approved Overtime</h4>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{approvedOvertime.startTime}</span>
            <span>{approvedOvertime.endTime}</span>
          </div>
          <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-yellow-500 transition-all duration-300"
              style={{
                width:
                  currentPeriod?.type === 'overtime'
                    ? `${
                        (differenceInMinutes(
                          currentTime,
                          new Date(
                            `${format(currentTime, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
                          ),
                        ) /
                          differenceInMinutes(
                            new Date(
                              `${format(currentTime, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
                            ),
                            new Date(
                              `${format(currentTime, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
                            ),
                          )) *
                        100
                      }%`
                    : '0%',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceProgress;

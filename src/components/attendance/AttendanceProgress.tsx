import React, { useState, useEffect } from 'react';
import { isWithinInterval, differenceInMinutes, format } from 'date-fns';
import {
  ShiftData,
  CurrentPeriodInfo,
  ApprovedOvertimeInfo,
} from '@/types/attendance';

interface AttendanceProgressProps {
  effectiveShift: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  latestAttendance?: {
    regularCheckInTime?: Date;
    regularCheckOutTime?: Date;
    overtimeCheckInTime?: Date;
    overtimeCheckOutTime?: Date;
    isLateCheckIn?: boolean;
    isOvertime?: boolean;
  } | null;
  approvedOvertime?: ApprovedOvertimeInfo | null;
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
    if (!checkInTime) return '0%';
    if (checkOutTime) {
      const outTime = new Date(checkOutTime);
      if (
        !isWithinInterval(outTime, {
          start: shiftStart,
          end: shiftEnd,
        })
      ) {
        return 'bg-red-200';
      }
      return '100%';
    }
    const elapsed = differenceInMinutes(currentTime, new Date(checkInTime));
    const progress = Math.min(100, (elapsed / totalShiftMinutes) * 100);
    return `${progress}%`;
  };

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{format(shiftStart, 'HH:mm')}</span>
        <span>{format(shiftEnd, 'HH:mm')}</span>
      </div>

      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`absolute h-full transition-all duration-300 ${
            checkOutTime
              ? isWithinInterval(new Date(checkOutTime), {
                  start: shiftStart,
                  end: shiftEnd,
                })
                ? 'bg-green-500'
                : 'bg-red-200'
              : 'bg-blue-500'
          }`}
          style={{ width: getProgressWidth() }}
        />

        {checkInTime && (
          <div
            className="absolute w-2 h-full bg-green-600"
            style={{
              left: `${(differenceInMinutes(new Date(checkInTime), shiftStart) / totalShiftMinutes) * 100}%`,
            }}
          />
        )}

        {checkOutTime && (
          <div
            className={`absolute w-2 h-full ${
              isWithinInterval(new Date(checkOutTime), {
                start: shiftStart,
                end: shiftEnd,
              })
                ? 'bg-green-600'
                : 'bg-red-600'
            }`}
            style={{
              left: `${(differenceInMinutes(new Date(checkOutTime), shiftStart) / totalShiftMinutes) * 100}%`,
            }}
          />
        )}
      </div>

      {approvedOvertime && (
        <>
          <div className="flex justify-between text-xs text-gray-500">
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
        </>
      )}

      <div className="flex gap-4 text-sm mt-2">
        {checkInTime && (
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-600" />
            <span>Check-in: {format(new Date(checkInTime), 'HH:mm')}</span>
          </div>
        )}
        {checkOutTime && (
          <div className="flex items-center gap-1">
            <div
              className={`w-2 h-2 rounded-full ${
                isWithinInterval(new Date(checkOutTime), {
                  start: shiftStart,
                  end: shiftEnd,
                })
                  ? 'bg-green-600'
                  : 'bg-red-600'
              }`}
            />
            <span>Check-out: {format(new Date(checkOutTime), 'HH:mm')}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceProgress;

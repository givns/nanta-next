import React from 'react';
import { format, formatDuration, differenceInMinutes } from 'date-fns';
import {
  ShiftData,
  CurrentPeriodInfo,
  LatestAttendance,
  AttendanceState,
  CheckStatus,
} from '@/types/attendance';

interface OvertimeInfoUI {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string;
}

interface UnifiedAttendanceStatusProps {
  effectiveShift: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  latestAttendance: LatestAttendance;
  approvedOvertime: OvertimeInfoUI | null;
  state: AttendanceState;
  checkStatus: CheckStatus;
  isHoliday: boolean;
  isDayOff: boolean;
  isOvertime: boolean;
}

const UnifiedAttendanceStatus: React.FC<UnifiedAttendanceStatusProps> = ({
  effectiveShift,
  currentPeriod,
  latestAttendance,
  approvedOvertime,
  state,
  checkStatus,
  isHoliday,
  isDayOff,
  isOvertime,
}) => {
  const [currentTime, setCurrentTime] = React.useState(new Date());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  const getAttendanceStatus = (): string => {
    if (isHoliday) {
      return 'Holiday';
    }

    if (isDayOff) {
      return 'Day Off';
    }

    if (!currentPeriod) {
      return 'Absent';
    }

    if (currentPeriod.type === 'overtime') {
      if (!currentPeriod.checkInTime) {
        return 'Waiting to Clock In for Overtime';
      }
      if (!currentPeriod.checkOutTime) {
        return 'Working Overtime';
      }
      return 'Overtime Completed';
    }

    if (!currentPeriod.checkInTime) {
      return 'Absent';
    }

    if (!currentPeriod.checkOutTime) {
      return 'Working';
    }

    return 'Work Completed';
  };

  const getAttendanceStatusColor = (): string => {
    if (isHoliday || isDayOff) {
      return 'text-blue-500';
    }

    if (!currentPeriod || !currentPeriod.checkInTime) {
      return 'text-red-500';
    }

    if (!currentPeriod.checkOutTime) {
      return 'text-green-500';
    }

    return 'text-gray-700';
  };

  const getAttendanceTime = (): string => {
    if (!latestAttendance?.regularCheckInTime) return '-';
    if (!latestAttendance?.regularCheckOutTime) {
      return format(new Date(latestAttendance.regularCheckInTime), 'HH:mm');
    }
    return `${format(new Date(latestAttendance.regularCheckInTime), 'HH:mm')} - ${format(
      new Date(latestAttendance.regularCheckOutTime),
      'HH:mm',
    )}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className={`text-5xl font-bold ${getAttendanceStatusColor()}`}>
          {getAttendanceStatus()}
        </div>
        {latestAttendance?.regularCheckInTime && (
          <div className="text-lg text-gray-500">{getAttendanceTime()}</div>
        )}
      </div>

      {effectiveShift && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-500">
            <span>{effectiveShift.startTime}</span>
            <span>{effectiveShift.endTime}</span>
          </div>
          {latestAttendance?.regularCheckInTime && (
            <div className="flex items-center gap-2 text-sm">
              <div
                className={`w-2 h-2 rounded-full ${
                  latestAttendance.regularCheckOutTime
                    ? 'bg-green-600'
                    : 'bg-yellow-500'
                }`}
              />
              <span>{getAttendanceTime()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedAttendanceStatus;

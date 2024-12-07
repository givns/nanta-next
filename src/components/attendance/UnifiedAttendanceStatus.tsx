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

  const getProgressBarColor = (): string => {
    if (isHoliday || isDayOff) {
      return 'bg-blue-500';
    }

    if (!currentPeriod || !currentPeriod.checkInTime) {
      return 'bg-red-500';
    }

    if (!currentPeriod.checkOutTime) {
      return 'bg-green-500';
    }

    return 'bg-gray-500';
  };

  const getProgressWidth = (): string => {
    if (!effectiveShift) return '0%';

    const shiftStart = new Date(
      `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
    );
    const shiftEnd = new Date(
      `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.endTime}`,
    );
    const totalShiftMinutes = differenceInMinutes(shiftEnd, shiftStart);

    if (!latestAttendance?.regularCheckInTime) {
      return '0%';
    }

    if (latestAttendance?.regularCheckOutTime) {
      return '100%';
    }

    const elapsed = differenceInMinutes(currentTime, shiftStart);
    return `${Math.min(100, (elapsed / totalShiftMinutes) * 100)}%`;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className={`text-4xl font-bold ${getAttendanceStatusColor()}`}>
          {getAttendanceStatus()}
        </div>
        {latestAttendance?.regularCheckInTime && (
          <div className="text-sm text-gray-500">{getAttendanceTime()}</div>
        )}
      </div>

      {effectiveShift && (
        <div>
          <div className="flex justify-between text-sm text-gray-500 mb-2">
            <span>{effectiveShift.startTime}</span>
            <span>{effectiveShift.endTime}</span>
          </div>
          <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`absolute h-full transition-all duration-300 ${getProgressBarColor()}`}
              style={{ width: getProgressWidth() }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedAttendanceStatus;

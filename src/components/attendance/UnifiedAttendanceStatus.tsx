import React, { useMemo } from 'react';
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

interface StatusDisplay {
  message: string;
  color: 'red' | 'green' | 'blue' | 'yellow';
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

const useStatusDisplay = (
  state: AttendanceState,
  checkStatus: CheckStatus,
  currentPeriod: CurrentPeriodInfo | null,
  isHoliday: boolean,
  isDayOff: boolean,
  isOvertime: boolean,
  approvedOvertime: OvertimeInfoUI | null,
): StatusDisplay => {
  return useMemo(() => {
    if (isHoliday) {
      const overtimeMsg = approvedOvertime ? ' (มีการอนุมัติ OT)' : '';
      return {
        message: `วันหยุดนักขัตฤกษ์${overtimeMsg}`,
        color: 'blue',
      };
    }

    if (isDayOff) {
      const overtimeMsg = approvedOvertime ? ' (มีการอนุมัติ OT)' : '';
      return {
        message: `วันหยุดประจำสัปดาห์${overtimeMsg}`,
        color: 'blue',
      };
    }

    if (!currentPeriod) {
      return {
        message: 'ไม่พบข้อมูลช่วงเวลาทำงาน',
        color: 'red',
      };
    }

    if (currentPeriod.type === 'overtime') {
      if (!currentPeriod.checkInTime) {
        return {
          message: 'รอลงเวลาเข้างาน OT',
          color: 'yellow',
        };
      }
      if (!currentPeriod.checkOutTime) {
        return {
          message: 'กำลังทำงานล่วงเวลา',
          color: 'green',
        };
      }
      return {
        message: 'เสร็จสิ้นการทำงานล่วงเวลา',
        color: 'blue',
      };
    }

    if (!currentPeriod.checkInTime) {
      return {
        message: 'รอลงเวลาเข้างาน',
        color: 'yellow',
      };
    }

    if (!currentPeriod.checkOutTime) {
      return {
        message: 'กำลังปฏิบัติงาน',
        color: 'green',
      };
    }

    return {
      message: 'เสร็จสิ้นการทำงาน',
      color: 'blue',
    };
  }, [
    state,
    checkStatus,
    currentPeriod,
    isHoliday,
    isDayOff,
    isOvertime,
    approvedOvertime,
  ]);
};

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

  const statusDisplay = useStatusDisplay(
    state,
    checkStatus,
    currentPeriod,
    isHoliday,
    isDayOff,
    isOvertime,
    approvedOvertime,
  );

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
      const elapsed = differenceInMinutes(currentTime, shiftStart);
      return `${Math.min(100, (elapsed / totalShiftMinutes) * 100)}%`;
    }

    if (latestAttendance?.regularCheckOutTime) {
      return '100%';
    }

    const elapsed = differenceInMinutes(currentTime, shiftStart);
    return `${Math.min(100, (elapsed / totalShiftMinutes) * 100)}%`;
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
    <div className="space-y-4">
      <div
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm text-${statusDisplay.color}-700`}
      >
        <div
          className={`w-2 h-2 rounded-full bg-${statusDisplay.color}-500 mr-2`}
        />
        <span>{statusDisplay.message}</span>
      </div>

      {effectiveShift && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{effectiveShift.startTime}</span>
            <span>{effectiveShift.endTime}</span>
          </div>

          <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`absolute h-full transition-all duration-300 bg-${
                statusDisplay.color
              }-500`}
              style={{ width: getProgressWidth() }}
            />
          </div>

          {latestAttendance?.regularCheckInTime && (
            <div className="flex items-center gap-2 text-sm">
              <div className="w-2 h-2 rounded-full bg-green-600" />
              <span>{getAttendanceTime()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedAttendanceStatus;

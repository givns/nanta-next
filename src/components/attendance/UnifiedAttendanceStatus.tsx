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

  const getStatusColor = (): string => {
    if (isHoliday) {
      return 'blue';
    }

    if (isDayOff) {
      return 'blue';
    }

    if (!currentPeriod) {
      return 'red';
    }

    if (currentPeriod.type === 'overtime') {
      if (!currentPeriod.checkInTime) {
        return 'yellow';
      }
      if (!currentPeriod.checkOutTime) {
        return 'green';
      }
      return 'blue';
    }

    if (!currentPeriod.checkInTime) {
      return 'red';
    }

    if (!currentPeriod.checkOutTime) {
      return 'green';
    }

    return 'blue';
  };

  const getStatusMessage = (): string => {
    if (isHoliday) {
      const overtimeMsg = approvedOvertime ? ' (มีการอนุมัติ OT)' : '';
      return `วันหยุดนักขัตฤกษ์${overtimeMsg}`;
    }

    if (isDayOff) {
      const overtimeMsg = approvedOvertime ? ' (มีการอนุมัติ OT)' : '';
      return `วันหยุดประจำสัปดาห์${overtimeMsg}`;
    }

    if (!currentPeriod) {
      return 'ไม่มาลงเวลาเข้างาน';
    }

    if (currentPeriod.type === 'overtime') {
      if (!currentPeriod.checkInTime) {
        return 'รอลงเวลาเข้างาน OT';
      }
      if (!currentPeriod.checkOutTime) {
        return 'กำลังทำงานล่วงเวลา';
      }
      return 'เสร็จสิ้นการทำงานล่วงเวลา';
    }

    if (!currentPeriod.checkInTime) {
      return 'ไม่มาลงเวลาเข้างาน';
    }

    if (!currentPeriod.checkOutTime) {
      return 'กำลังปฏิบัติงาน';
    }

    return 'เสร็จสิ้นการทำงาน';
  };

  const getOvertimeProgressWidth = (): string => {
    if (!approvedOvertime) return '0%';
    const overtimeStart = new Date(
      `${format(currentTime, 'yyyy-MM-dd')}T${approvedOvertime.startTime}`,
    );
    const overtimeEnd = new Date(
      `${format(currentTime, 'yyyy-MM-dd')}T${approvedOvertime.endTime}`,
    );
    const totalOvertimeMinutes = differenceInMinutes(
      overtimeEnd,
      overtimeStart,
    );
    const elapsedOvertimeMinutes = differenceInMinutes(
      currentTime,
      overtimeStart,
    );
    return `${Math.min(100, (elapsedOvertimeMinutes / totalOvertimeMinutes) * 100)}%`;
  };

  return (
    <div className="space-y-4">
      <div className="relative h-12 bg-gray-100 rounded-full overflow-hidden">
        {!latestAttendance?.regularCheckInTime && (
          <div className="absolute h-full w-full bg-red-500 opacity-50" />
        )}
        <div
          className={`absolute h-full transition-all duration-300 bg-${getStatusColor()}-500`}
          style={{ width: getProgressWidth() }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-white font-medium truncate px-2">
            {getStatusMessage()}
          </div>
        </div>

        {approvedOvertime && (
          <div
            className={`absolute h-full transition-all duration-300 bg-yellow-500`}
            style={{
              width: getOvertimeProgressWidth(),
              left: getProgressWidth(),
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center text-white font-medium">
              OT
            </div>
          </div>
        )}
      </div>

      {effectiveShift && (
        <div className="flex justify-between text-xs text-gray-500">
          <span>{effectiveShift.startTime}</span>
          <span>{effectiveShift.endTime}</span>
        </div>
      )}

      {latestAttendance?.regularCheckInTime && (
        <div className="flex items-center gap-2 text-sm">
          <div className="w-2 h-2 rounded-full bg-green-600" />
          <span>{getAttendanceTime()}</span>
        </div>
      )}
    </div>
  );
};

export default UnifiedAttendanceStatus;

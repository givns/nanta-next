import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { differenceInMinutes } from 'date-fns';
import {
  AttendanceState,
  CheckStatus,
  CurrentPeriodInfo,
  ShiftData,
  LatestAttendance,
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
  color: 'red' | 'green' | 'blue';
  progressColor: string;
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
        progressColor: 'bg-blue-500',
      };
    }

    if (isDayOff) {
      const overtimeMsg = approvedOvertime ? ' (มีการอนุมัติ OT)' : '';
      return {
        message: `วันหยุดประจำสัปดาห์${overtimeMsg}`,
        color: 'blue',
        progressColor: 'bg-blue-500',
      };
    }

    if (!currentPeriod) {
      return {
        message: 'ไม่พบข้อมูลช่วงเวลาทำงาน',
        color: 'red',
        progressColor: 'bg-red-500',
      };
    }

    if (currentPeriod.type === 'overtime') {
      if (!currentPeriod.checkInTime) {
        return {
          message: 'รอลงเวลาเข้างาน OT',
          color: 'blue',
          progressColor: 'bg-yellow-500',
        };
      }
      if (!currentPeriod.checkOutTime) {
        return {
          message: 'กำลังทำงานล่วงเวลา',
          color: 'green',
          progressColor: 'bg-yellow-500',
        };
      }
      return {
        message: 'เสร็จสิ้นการทำงานล่วงเวลา',
        color: 'blue',
        progressColor: 'bg-green-500',
      };
    }

    if (!currentPeriod.checkInTime) {
      return {
        message: 'รอลงเวลาเข้างาน',
        color: 'blue',
        progressColor: 'bg-blue-500',
      };
    }

    if (!currentPeriod.checkOutTime) {
      return {
        message: 'กำลังปฏิบัติงาน',
        color: 'green',
        progressColor: 'bg-blue-500',
      };
    }

    return {
      message: 'เสร็จสิ้นการทำงาน',
      color: 'blue',
      progressColor: 'bg-green-500',
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

  return (
    <div className="space-y-4">
      <div
        className="inline-flex items-center px-3 py-1 rounded-full text-sm"
        style={{
          backgroundColor: `rgba(${
            statusDisplay.color === 'red'
              ? '239, 68, 68'
              : statusDisplay.color === 'green'
                ? '34, 197, 94'
                : '59, 130, 246'
          }, 0.1)`,
        }}
      >
        <div
          className={`w-2 h-2 rounded-full bg-${statusDisplay.color}-500 mr-2`}
        />
        <span className={`text-${statusDisplay.color}-700`}>
          {statusDisplay.message}
        </span>
      </div>

      {effectiveShift && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-gray-500">
            <span>{effectiveShift.startTime}</span>
            <span>{effectiveShift.endTime}</span>
          </div>

          <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`absolute h-full transition-all duration-300 ${statusDisplay.progressColor}`}
              style={{ width: getProgressWidth() }}
            />

            {latestAttendance?.regularCheckInTime && (
              <div
                className="absolute w-2 h-full bg-green-600"
                style={{
                  left: `${
                    (differenceInMinutes(
                      new Date(latestAttendance.regularCheckInTime),
                      new Date(
                        `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
                      ),
                    ) /
                      differenceInMinutes(
                        new Date(
                          `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.endTime}`,
                        ),
                        new Date(
                          `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
                        ),
                      )) *
                    100
                  }%`,
                }}
              />
            )}

            {latestAttendance?.regularCheckOutTime && (
              <div
                className="absolute w-2 h-full bg-green-600"
                style={{
                  left: `${
                    (differenceInMinutes(
                      new Date(latestAttendance.regularCheckOutTime),
                      new Date(
                        `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
                      ),
                    ) /
                      differenceInMinutes(
                        new Date(
                          `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.endTime}`,
                        ),
                        new Date(
                          `${format(currentTime, 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
                        ),
                      )) *
                    100
                  }%`,
                }}
              />
            )}
          </div>

          {(latestAttendance?.regularCheckInTime ||
            latestAttendance?.regularCheckOutTime) && (
            <div className="flex gap-4 text-sm mt-2">
              {latestAttendance.regularCheckInTime && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-600" />
                  <span>
                    เข้างาน:{' '}
                    {format(
                      new Date(latestAttendance.regularCheckInTime),
                      'HH:mm',
                    )}
                  </span>
                </div>
              )}
              {latestAttendance.regularCheckOutTime && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-600" />
                  <span>
                    ออกงาน:{' '}
                    {format(
                      new Date(latestAttendance.regularCheckOutTime),
                      'HH:mm',
                    )}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedAttendanceStatus;

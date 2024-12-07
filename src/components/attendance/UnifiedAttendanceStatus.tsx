import React from 'react';
import { format, differenceInMinutes } from 'date-fns';
import {
  ShiftData,
  CurrentPeriodInfo,
  LatestAttendance,
  AttendanceState,
  CheckStatus,
} from '@/types/attendance';
import { CheckCircleIcon, ClockIcon, XCircleIcon } from 'lucide-react';

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
      return 'วันหยุดนักขัตฤกษ์';
    }

    if (isDayOff) {
      return 'วันหยุดประจำสัปดาห์';
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

  const getAttendanceStatusIcon = (): React.ReactNode => {
    const status = getAttendanceStatus();

    if (status === 'วันหยุดนักขัตฤกษ์' || status === 'วันหยุดประจำสัปดาห์') {
      return <CheckCircleIcon className="w-8 h-8 text-blue-500" />;
    }

    if (status === 'ไม่มาลงเวลาเข้างาน' || status === 'รอลงเวลาเข้างาน OT') {
      return <XCircleIcon className="w-8 h-8 text-red-500" />;
    }

    if (status === 'กำลังปฏิบัติงาน' || status === 'กำลังทำงานล่วงเวลา') {
      return <ClockIcon className="w-8 h-8 text-green-500" />;
    }

    return <CheckCircleIcon className="w-8 h-8 text-gray-500" />;
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

  const getShiftStatus = (): string => {
    if (!latestAttendance?.regularCheckInTime) {
      return 'ไม่มาลงเวลาเข้างาน';
    }

    if (!latestAttendance?.regularCheckOutTime) {
      return 'กำลังปฏิบัติงาน';
    }

    return 'เสร็จสิ้นการทำงาน';
  };

  const getShiftStatusColor = (): string => {
    const status = getShiftStatus();

    if (status === 'ไม่มาลงเวลาเข้างาน') {
      return 'text-red-500';
    }

    if (status === 'กำลังปฏิบัติงาน') {
      return 'text-green-500';
    }

    return 'text-gray-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {getAttendanceStatusIcon()}
          <div className="text-3xl font-bold">{getAttendanceStatus()}</div>
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
          <div className={`text-sm ${getShiftStatusColor()}`}>
            {getShiftStatus()}
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedAttendanceStatus;

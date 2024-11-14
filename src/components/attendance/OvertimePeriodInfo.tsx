// components/attendance/OvertimePeriodInfo.tsx
import React from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { OvertimeAttendanceInfo } from '@/types/attendance';

interface OvertimePeriodInfoProps {
  overtime: OvertimeAttendanceInfo;
  isDayOff?: boolean;
}

export const OvertimePeriodInfo: React.FC<OvertimePeriodInfoProps> = ({
  overtime,
  isDayOff = false,
}) => {
  const { overtimeRequest, attendanceTime, periodStatus } = overtime;

  const getStatusDisplay = () => {
    if (periodStatus.isActive) return '* กำลังอยู่ในช่วงเวลาทำงานล่วงเวลา';
    if (periodStatus.isNext) return '* ช่วงเวลาทำงานล่วงเวลาถัดไป';
    if (periodStatus.isComplete) return '* เสร็จสิ้น';
    return '* รอเริ่มเวลาทำงานล่วงเวลา';
  };

  return (
    <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
      <h4 className="text-md font-semibold mb-2 flex items-center">
        <AlertCircle className="mr-2" size={18} />
        {isDayOff ? 'การทำงานล่วงเวลาในวันหยุด' : 'การทำงานล่วงเวลา'}
      </h4>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-gray-600">เวลาที่อนุมัติ</p>
          <p className="font-medium">
            {overtimeRequest.startTime} - {overtimeRequest.endTime}
          </p>
        </div>
        <div>
          <p className="text-gray-600">เวลาทำงานจริง</p>
          <p className="font-medium">
            {attendanceTime?.checkInTime || 'ยังไม่ได้ลงเวลา'}
            {' - '}
            {attendanceTime?.checkOutTime || 'ยังไม่สิ้นสุด'}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <div className="flex items-center text-sm text-blue-600">
          <Clock className="mr-2 h-4 w-4" />
          {getStatusDisplay()}
        </div>
      </div>
    </div>
  );
};

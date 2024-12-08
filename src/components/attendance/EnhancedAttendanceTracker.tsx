import React from 'react';
import { format } from 'date-fns';
import { AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import {
  ShiftData,
  CurrentPeriodInfo,
  LatestAttendance,
} from '@/types/attendance';

interface EnhancedAttendanceTrackerProps {
  shiftData: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  attendanceStatus: LatestAttendance;
  overtimeInfo?: OvertimeInfoUI | null;
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

const getProgressWidth = (
  startTime: string,
  endTime: string,
  currentTime: string,
): number => {
  const start = new Date(`2000-01-01T${startTime}`);
  const end = new Date(`2000-01-01T${endTime}`);
  const current = new Date(`2000-01-01T${currentTime}`);

  const total = end.getTime() - start.getTime();
  const elapsed = current.getTime() - start.getTime();

  return Math.min(100, Math.max(0, (elapsed / total) * 100));
};

const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

const EnhancedAttendanceTracker: React.FC<EnhancedAttendanceTrackerProps> = ({
  shiftData,
  currentPeriod,
  attendanceStatus,
  overtimeInfo,
}) => {
  if (!shiftData || !currentPeriod) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2 text-gray-500">
          <AlertCircle size={20} />
          <span>ไม่พบข้อมูลกะการทำงาน</span>
        </div>
      </div>
    );
  }

  const currentTime = format(new Date(), 'HH:mm');
  const currentMinutes = timeToMinutes(currentTime);
  const shiftStartMinutes = timeToMinutes(shiftData.startTime);
  const shiftEndMinutes = timeToMinutes(shiftData.endTime);

  // Determine current attendance state
  const getAttendanceState = () => {
    if (currentPeriod.type === 'overtime') {
      return {
        title: 'ช่วงเวลาทำงานล่วงเวลา',
        color: 'bg-yellow-500',
        textColor: 'text-yellow-800',
      };
    }

    if (!attendanceStatus.regularCheckInTime) {
      if (currentMinutes < shiftStartMinutes) {
        return {
          title: 'รอเวลาลงเวลาเข้างาน',
          color: 'bg-blue-500',
          textColor: 'text-blue-800',
        };
      }
      return {
        title: 'ยังไม่ได้ลงเวลาเข้างาน',
        color: 'bg-red-500',
        textColor: 'text-red-800',
      };
    }

    if (!attendanceStatus.regularCheckOutTime) {
      return {
        title: 'กำลังปฏิบัติงาน',
        color: 'bg-green-500',
        textColor: 'text-green-800',
      };
    }

    return {
      title: 'เสร็จสิ้นการทำงาน',
      color: 'bg-gray-500',
      textColor: 'text-gray-800',
    };
  };

  const state = getAttendanceState();

  const getActionGuidance = () => {
    if (currentPeriod.type === 'overtime') {
      if (!attendanceStatus.regularCheckInTime) {
        return 'กรุณาลงเวลาเข้างาน OT';
      }
      if (!attendanceStatus.regularCheckOutTime) {
        return 'กรุณาลงเวลาออกงาน OT เมื่อเสร็จสิ้น';
      }
    }

    if (overtimeInfo && currentMinutes >= timeToMinutes(shiftData.endTime)) {
      if (!attendanceStatus.regularCheckOutTime) {
        return 'กรุณาลงเวลาออกงานปกติก่อนเริ่ม OT';
      }
      return 'กรุณาลงเวลาเข้างาน OT';
    }

    if (
      !attendanceStatus.regularCheckInTime &&
      currentMinutes >= shiftStartMinutes
    ) {
      return 'กรุณาลงเวลาเข้างานโดยเร็วที่สุด';
    }

    return null;
  };

  const guidance = getActionGuidance();

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-2 ${state.textColor}`}>
          <Clock size={20} />
          <span className="font-semibold">{state.title}</span>
        </div>
        <div className="text-sm text-gray-500">{currentTime}</div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-500">
          <span>{shiftData.startTime}</span>
          <span>{shiftData.endTime}</span>
        </div>
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`absolute h-full transition-all duration-300 ${state.color}`}
            style={{
              width: `${getProgressWidth(shiftData.startTime, shiftData.endTime, currentTime)}%`,
            }}
          />

          {/* Attendance Markers */}
          {attendanceStatus.regularCheckInTime && (
            <div
              className="absolute w-2 h-full bg-green-600"
              style={{
                left: `${getProgressWidth(shiftData.startTime, shiftData.endTime, format(new Date(attendanceStatus.regularCheckInTime), 'HH:mm'))}%`,
              }}
            />
          )}
          {attendanceStatus.regularCheckOutTime && (
            <div
              className="absolute w-2 h-full bg-green-600"
              style={{
                left: `${getProgressWidth(shiftData.startTime, shiftData.endTime, format(new Date(attendanceStatus.regularCheckOutTime), 'HH:mm'))}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* Attendance Times */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2">
            {attendanceStatus.regularCheckInTime ? (
              <CheckCircle2 className="text-green-500" size={16} />
            ) : (
              <XCircle className="text-gray-300" size={16} />
            )}
            <span className="text-sm text-gray-600">เวลาเข้างาน</span>
          </div>
          <span className="text-lg font-semibold">
            {attendanceStatus.regularCheckInTime
              ? format(new Date(attendanceStatus.regularCheckInTime), 'HH:mm')
              : '--:--'}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            {attendanceStatus.regularCheckOutTime ? (
              <CheckCircle2 className="text-green-500" size={16} />
            ) : (
              <XCircle className="text-gray-300" size={16} />
            )}
            <span className="text-sm text-gray-600">เวลาออกงาน</span>
          </div>
          <span className="text-lg font-semibold">
            {attendanceStatus.regularCheckOutTime
              ? format(new Date(attendanceStatus.regularCheckOutTime), 'HH:mm')
              : '--:--'}
          </span>
        </div>
      </div>

      {/* Action Guidance */}
      {guidance && (
        <div className="flex items-center gap-2 p-3 bg-yellow-50 rounded-lg">
          <AlertCircle className="text-yellow-500" size={20} />
          <p className="text-sm text-yellow-800">{guidance}</p>
        </div>
      )}

      {/* Overtime Info */}
      {overtimeInfo && (
        <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <Clock className="text-yellow-500" size={16} />
            ช่วงเวลาทำงานล่วงเวลา
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>เริ่ม {overtimeInfo.startTime}</span>
              <span>สิ้นสุด {overtimeInfo.endTime}</span>
            </div>
            <div className="text-sm text-gray-600">
              ระยะเวลา {overtimeInfo.durationMinutes} นาที
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedAttendanceTracker;

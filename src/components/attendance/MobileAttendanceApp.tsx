import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { AlertCircle, Clock, User, Building2, Calendar } from 'lucide-react';
import {
  ShiftData,
  CurrentPeriodInfo,
  LatestAttendance,
} from '@/types/attendance';

interface ShiftStatusInfo {
  isHoliday: boolean;
  isDayOff: boolean;
}

interface MobileAttendanceAppProps {
  userData: {
    name: string;
    employeeId: string;
    departmentName: string;
  };
  shiftData: ShiftData | null;
  currentPeriod: CurrentPeriodInfo | null;
  status: ShiftStatusInfo;
  attendanceStatus: LatestAttendance;
  overtimeInfo?: OvertimeInfoUI | null;
  validation?: {
    allowed: boolean;
    reason?: string;
  };
  onAction: () => void;
  locationState: {
    isReady: boolean;
    error?: string;
  };
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

const MobileAttendanceApp: React.FC<MobileAttendanceAppProps> = ({
  userData,
  shiftData,
  currentPeriod,
  status,
  attendanceStatus,
  overtimeInfo,
  validation,
  onAction,
  locationState,
}) => {
  const currentTime = new Date();
  const isCheckingIn = !attendanceStatus.regularCheckInTime;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-30 bg-white border-b border-gray-100">
        <div className="px-4 py-3">
          <div className="text-center text-4xl font-bold mb-1">
            {format(currentTime, 'HH:mm')}
          </div>
          <div className="text-center text-sm text-gray-500">
            {format(currentTime, 'EEEE d MMMM yyyy', { locale: th })}
          </div>
        </div>
      </header>

      {/* Main Content - Scrollable */}
      <main className="flex-1 mt-20 mb-24 overflow-y-auto">
        {/* Employee Quick Info */}
        <div className="bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <User size={20} className="text-gray-400" />
            <div>
              <div className="font-medium text-2xl">{userData.name}</div>
              <div className="text-sm text-gray-500">
                รหัส: {userData.employeeId}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Building2 size={20} className="text-gray-400" />
            <div className="text-sm text-gray-500">
              {userData.departmentName}
            </div>
          </div>
        </div>

        {/* Current Status Card */}
        <div className="m-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Clock size={20} className="text-primary" />
                <span className="font-medium">สถานะการทำงาน</span>
              </div>
              {currentPeriod?.type === 'overtime' && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                  OT
                </span>
              )}
            </div>
            {shiftData && (
              <div className="text-sm text-gray-500">
                เวลางาน {shiftData.startTime} - {shiftData.endTime} น.
              </div>
            )}
          </div>

          {/* Progress Section */}
          <div className="p-4 bg-gray-50">
            {/* Progress Bar */}
            {shiftData && (
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                  className={`absolute h-full transition-all duration-300 ${
                    currentPeriod?.type === 'overtime'
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{
                    width: `${
                      ((currentTime.getHours() * 60 +
                        currentTime.getMinutes() -
                        (parseInt(shiftData.startTime.split(':')[0]) * 60 +
                          parseInt(shiftData.startTime.split(':')[1]))) /
                        (parseInt(shiftData.endTime.split(':')[0]) * 60 +
                          parseInt(shiftData.endTime.split(':')[1]) -
                          (parseInt(shiftData.startTime.split(':')[0]) * 60 +
                            parseInt(shiftData.startTime.split(':')[1])))) *
                      100
                    }%`,
                  }}
                />
              </div>
            )}

            {/* Times Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">เข้างาน</div>
                <div className="font-medium">
                  {attendanceStatus.regularCheckInTime
                    ? format(
                        new Date(attendanceStatus.regularCheckInTime),
                        'HH:mm',
                      )
                    : '--:--'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">ออกงาน</div>
                <div className="font-medium">
                  {attendanceStatus.regularCheckOutTime
                    ? format(
                        new Date(attendanceStatus.regularCheckOutTime),
                        'HH:mm',
                      )
                    : '--:--'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Overtime Section (if exists) */}
        {overtimeInfo && (
          <div className="mx-4 mb-4 bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Calendar size={20} className="text-yellow-500" />
                <span className="font-medium">การทำงานล่วงเวลา</span>
              </div>
              <div className="text-sm text-gray-500">
                {overtimeInfo.startTime} - {overtimeInfo.endTime} (
                {overtimeInfo.durationMinutes} นาที)
              </div>
            </div>
            {overtimeInfo.reason && (
              <div className="p-4 bg-yellow-50">
                <div className="text-sm text-yellow-700">
                  {overtimeInfo.reason}
                </div>
              </div>
            )}
          </div>
        )}

        {/* System Status */}
        {locationState.error && (
          <div className="mx-4 mb-4 p-4 bg-red-50 rounded-xl">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={20} />
              <span className="text-sm">{locationState.error}</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default MobileAttendanceApp;

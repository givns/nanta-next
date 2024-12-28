// components/attendance/MobileAttendanceApp.tsx
import React from 'react';
import { addMinutes, differenceInMinutes, format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { AlertCircle, Clock, User, Building2 } from 'lucide-react';
import { PeriodType } from '@prisma/client';
import {
  ShiftData,
  UnifiedPeriodState,
  OvertimeContext,
  AttendanceBaseResponse,
  ValidationResponseWithMetadata,
  UserData,
} from '@/types/attendance';
import { StatusHelpers } from '@/services/Attendance/utils/StatusHelper';
import { getCurrentTime } from '@/utils/dateUtils';

interface MobileAttendanceAppProps {
  userData: UserData;
  shiftData: ShiftData | null;
  currentPeriod: UnifiedPeriodState;
  status: {
    isHoliday: boolean;
    isDayOff: boolean;
  };
  attendanceStatus: AttendanceBaseResponse;
  overtimeInfo?: OvertimeContext | null;
  validation: ValidationResponseWithMetadata;
  locationState: {
    isReady: boolean;
    error?: string;
  };
  onAction: () => void;
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
  const currentTime = getCurrentTime();

  // Use StatusHelpers to get composite status
  const currentCompositeStatus = React.useMemo(
    () => ({
      state: attendanceStatus.state,
      checkStatus: attendanceStatus.checkStatus,
      isOvertime: attendanceStatus.periodInfo.isOvertime,
      overtimeState: attendanceStatus.periodInfo.overtimeState,
    }),
    [attendanceStatus],
  );

  // Calculate progress safely
  const getProgressPercentage = React.useCallback(() => {
    if (!currentPeriod?.timeWindow?.start || !currentPeriod?.timeWindow?.end)
      return 0;

    try {
      const now = getCurrentTime();
      // Ensure all times are in UTC
      const periodStart = parseISO(currentPeriod.timeWindow.start);
      const periodEnd = parseISO(currentPeriod.timeWindow.end);
      // Adjust now to UTC for comparison
      const utcNow = addMinutes(now, now.getTimezoneOffset());

      const totalMinutes = differenceInMinutes(periodEnd, periodStart);
      if (totalMinutes <= 0) return 0;

      const elapsedMinutes = differenceInMinutes(utcNow, periodStart);
      console.log('Progress calc:', { elapsedMinutes, totalMinutes });
      return Math.max(0, Math.min((elapsedMinutes / totalMinutes) * 100, 100));
    } catch (error) {
      console.error('Progress calculation error:', error);
      return 0;
    }
  }, [currentPeriod]);

  const formatUtcTime = (isoString: string) => {
    try {
      const date = parseISO(isoString);
      // Add offset to keep the UTC time
      const utcDate = addMinutes(date, date.getTimezoneOffset());
      return format(utcDate, 'HH:mm');
    } catch {
      return '--:--';
    }
  };

  // Safe date formatting helper
  const formatTimeFromISO = (dateString: string | null | undefined): string => {
    if (!dateString) return '--:--';
    return formatUtcTime(dateString);
  };

  // Handle check-in/check-out times safely
  const checkInTime = React.useMemo(() => {
    if (!attendanceStatus.latestAttendance?.CheckInTime) return '--:--';
    return formatTimeFromISO(
      attendanceStatus.latestAttendance.CheckInTime.toString(),
    );
  }, [attendanceStatus.latestAttendance?.CheckInTime]);

  const checkOutTime = React.useMemo(() => {
    if (!attendanceStatus.latestAttendance?.CheckOutTime) return '--:--';
    return formatTimeFromISO(
      attendanceStatus.latestAttendance.CheckOutTime.toString(),
    );
  }, [attendanceStatus.latestAttendance?.CheckOutTime]);

  // Handle overtime periods safely
  const relevantOvertimes = React.useMemo(() => {
    if (!overtimeInfo) return null;
    try {
      const currentTimeStr = format(currentTime, 'HH:mm');

      // Validate overtime times
      if (!overtimeInfo.startTime || !overtimeInfo.endTime) return null;

      if (
        overtimeInfo.startTime > currentTimeStr ||
        (overtimeInfo.startTime <= currentTimeStr &&
          overtimeInfo.endTime > currentTimeStr)
      ) {
        return overtimeInfo;
      }
    } catch (error) {
      console.error('Error processing overtime info:', error);
    }
    return null;
  }, [overtimeInfo, currentTime]);

  // Determine if we should show progress
  const shouldShowProgress =
    status.isDayOff || status.isHoliday
      ? currentPeriod.activity.isOvertime
      : true;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header with current time */}
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

      <main className="flex-1 mt-20 mb-24 overflow-y-auto">
        {/* User Information */}
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

        {/* Status Card */}
        <div className="m-4 bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Clock size={20} className="text-primary" />
                <span className="font-medium">
                  {StatusHelpers.getDisplayStatus(currentCompositeStatus)}
                </span>
              </div>
              {relevantOvertimes && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full">
                  OT
                </span>
              )}
            </div>

            {/* Schedule Information */}
            {(status.isDayOff || status.isHoliday) && (
              <div className="text-sm text-gray-500">
                {status.isHoliday ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุด'}
              </div>
            )}

            {shiftData &&
              !status.isDayOff &&
              !status.isHoliday &&
              currentPeriod.type !== PeriodType.OVERTIME && (
                <div className="text-sm text-gray-500">
                  เวลางาน {shiftData.startTime} - {shiftData.endTime} น.
                </div>
              )}

            {/* Overtime Information */}
            {relevantOvertimes && (
              <div className="text-sm text-gray-500 mt-1">
                {!attendanceStatus.latestAttendance?.CheckOutTime &&
                !status.isDayOff
                  ? 'มีการทำงานล่วงเวลาวันนี้: '
                  : 'เวลาทำงานล่วงเวลา: '}
                {relevantOvertimes.startTime} - {relevantOvertimes.endTime} น.
                <span className="ml-2 text-xs">
                  ({relevantOvertimes.durationMinutes} นาที)
                </span>
              </div>
            )}
          </div>

          {/* Progress and Times */}
          <div className="p-4 bg-gray-50">
            {shouldShowProgress && currentPeriod && (
              <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                <div
                  className={`absolute h-full transition-all duration-300 ${
                    currentPeriod.type === PeriodType.OVERTIME
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${getProgressPercentage()}%` }}
                />
              </div>
            )}

            {/* Regular Period Times */}
            <div>
              <div className="text-sm font-medium mb-2">กะปกติ</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">เข้างาน</div>
                  <div className="font-medium">{checkInTime}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">ออกงาน</div>
                  <div className="font-medium">{checkOutTime}</div>
                </div>
              </div>
            </div>

            {/* Status Messages */}
            {currentPeriod.type === PeriodType.OVERTIME && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-sm text-gray-700">
                  {validation?.reason?.includes('ย้อนหลัง')
                    ? validation.reason
                    : currentPeriod.activity.isActive
                      ? 'อยู่ในช่วงเวลาทำงานล่วงเวลา'
                      : currentTime < parseISO(currentPeriod.timeWindow.start)
                        ? `เริ่มทำงานล่วงเวลาเวลา ${overtimeInfo?.startTime} น.`
                        : 'หมดเวลาทำงานล่วงเวลา'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error Messages */}
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

export default React.memo(MobileAttendanceApp);

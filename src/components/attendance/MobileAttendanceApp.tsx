// components/attendance/MobileAttendanceApp.tsx
import React, { useMemo } from 'react';
import { differenceInMinutes, format, parseISO } from 'date-fns';
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
import { formatSafeTime, normalizeTimeString } from '@/shared/timeUtils';

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

interface ProgressMetrics {
  lateMinutes: number;
  earlyMinutes: number;
  isEarly: boolean;
  progressPercent: number;
  totalShiftMinutes: number;
  isMissed: boolean;
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

  const calculateProgressMetrics = React.useCallback((): ProgressMetrics => {
    if (!currentPeriod?.timeWindow?.start || !currentPeriod?.timeWindow?.end) {
      return {
        lateMinutes: 0,
        earlyMinutes: 0,
        isEarly: false,
        progressPercent: 0,
        totalShiftMinutes: 0,
        isMissed: true,
      };
    }

    try {
      const now = getCurrentTime();

      // Normalize the times to +07:00
      const normalizedStart = normalizeTimeString(
        currentPeriod.timeWindow.start,
      );
      const normalizedEnd = normalizeTimeString(currentPeriod.timeWindow.end);
      const normalizedCheckIn = currentPeriod.activity.checkIn
        ? normalizeTimeString(currentPeriod.activity.checkIn)
        : null;

      console.log('Using normalized times:', {
        normalizedStart,
        normalizedEnd,
        normalizedCheckIn,
        now: now.toISOString(),
      });

      // Direct parse of normalized times
      const shiftStart = parseISO(normalizedStart);
      const shiftEnd = parseISO(normalizedEnd);
      const checkInTime = normalizedCheckIn
        ? parseISO(normalizedCheckIn)
        : null;

      // Calculate total shift duration
      const totalShiftMinutes = differenceInMinutes(shiftEnd, shiftStart);

      if (!checkInTime) {
        return {
          lateMinutes: totalShiftMinutes,
          earlyMinutes: 0,
          isEarly: false,
          progressPercent: 0,
          totalShiftMinutes,
          isMissed: true,
        };
      }

      const earlyMinutes = Math.max(
        0,
        differenceInMinutes(shiftStart, checkInTime),
      );
      const isEarly = earlyMinutes > 0;
      const lateMinutes = !isEarly
        ? Math.max(0, differenceInMinutes(checkInTime, shiftStart))
        : 0;

      const progressStartTime = isEarly ? shiftStart : checkInTime;
      const elapsedMinutes = Math.max(
        0,
        differenceInMinutes(now, progressStartTime),
      );
      const progressPercent = Math.min(
        (elapsedMinutes / totalShiftMinutes) * 100,
        100,
      );

      return {
        lateMinutes,
        earlyMinutes,
        isEarly,
        progressPercent,
        totalShiftMinutes,
        isMissed: false,
      };
    } catch (error) {
      console.error('Progress calculation error:', error, {
        timeWindow: currentPeriod.timeWindow,
        activity: currentPeriod.activity,
      });
      return {
        lateMinutes: 0,
        earlyMinutes: 0,
        isEarly: false,
        progressPercent: 0,
        totalShiftMinutes: 0,
        isMissed: true,
      };
    }
  }, [currentPeriod]);

  // Handle check-in/check-out times safely by removing timezone info
  const checkInTime = useMemo(() => {
    if (!attendanceStatus.latestAttendance?.CheckInTime) return '--:--';
    const rawTime = attendanceStatus.latestAttendance.CheckInTime;
    try {
      // Extract just HH:mm from the time string
      const timeMatch = rawTime.toString().match(/(\d{2}):(\d{2})/);
      if (timeMatch) {
        return `${timeMatch[1]}:${timeMatch[2]}`;
      }
      return '--:--';
    } catch (error) {
      console.error('Error parsing check-in time:', error);
      return '--:--';
    }
  }, [attendanceStatus.latestAttendance?.CheckInTime]);

  const checkOutTime = useMemo(() => {
    if (!attendanceStatus.latestAttendance?.CheckOutTime) return '--:--';
    const rawTime = attendanceStatus.latestAttendance.CheckOutTime;
    try {
      const timeMatch = rawTime.toString().match(/(\d{2}):(\d{2})/);
      if (timeMatch) {
        return `${timeMatch[1]}:${timeMatch[2]}`;
      }
      return '--:--';
    } catch (error) {
      console.error('Error parsing check-out time:', error);
      return '--:--';
    }
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
            {shouldShowProgress &&
              currentPeriod &&
              (() => {
                const metrics = calculateProgressMetrics();

                return (
                  <div className="space-y-1">
                    <div className="relative h-3 rounded-full overflow-hidden mb-4">
                      {/* Base layer - full shift duration */}
                      <div className="absolute w-full h-full bg-gray-100" />

                      {/* Missed time - subtle pattern or gradient */}
                      {metrics.lateMinutes > 0 && (
                        <div
                          className="absolute h-full bg-gradient-to-r from-blue-100 to-blue-300"
                          style={{
                            width: `${(metrics.lateMinutes / metrics.totalShiftMinutes) * 100}%`,
                          }}
                        />
                      )}

                      {/* Early arrival indicator */}
                      {metrics.isEarly && (
                        <div
                          className="absolute h-full bg-green-200"
                          style={{
                            width: `${(metrics.earlyMinutes / metrics.totalShiftMinutes) * 100}%`,
                            left: '0%',
                          }}
                        />
                      )}

                      {/* Work progress */}
                      {!metrics.isMissed && (
                        <div
                          className={`absolute h-full transition-all duration-300 ${
                            currentPeriod.type === PeriodType.OVERTIME
                              ? 'bg-yellow-500'
                              : 'bg-blue-500'
                          }`}
                          style={{
                            width: `${metrics.progressPercent}%`,
                            left: metrics.isEarly
                              ? `${(metrics.earlyMinutes / metrics.totalShiftMinutes) * 100}%`
                              : `${(metrics.lateMinutes / metrics.totalShiftMinutes) * 100}%`,
                          }}
                        />
                      )}

                      {/* Missed entire shift */}
                      {metrics.isMissed && (
                        <div
                          className="absolute h-full bg-red-400"
                          style={{
                            width: '100%',
                          }}
                        />
                      )}
                    </div>

                    {/* Optional: Progress indicator text */}
                    <div className="text-xs text-gray-500 flex justify-between px-1">
                      <span>{formatSafeTime(shiftData?.startTime)}</span>
                      <span>{formatSafeTime(shiftData?.endTime)}</span>
                    </div>
                  </div>
                );
              })()}

            {/* Regular Period Times */}
            <div>
              <div className="text-sm font-medium mb-2">กะปกติ</div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">เข้างาน</div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium">{checkInTime}</div>
                    {validation.flags.isLateCheckIn && (
                      <span className="text-xs px-1.5 py-0.5 bg-red-50 text-red-600 rounded">
                        เข้างานสาย
                      </span>
                    )}
                  </div>
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

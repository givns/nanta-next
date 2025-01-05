import React, { useMemo } from 'react';
import { differenceInMinutes, format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { AlertCircle, Clock, User, Building2 } from 'lucide-react';
import { PeriodType } from '@prisma/client';
import { StatusHelpers } from '@/services/Attendance/utils/StatusHelper';
import { getCurrentTime } from '@/utils/dateUtils';
import { formatSafeTime } from '@/shared/timeUtils';
import {
  ShiftData,
  UnifiedPeriodState,
  AttendanceBaseResponse,
  OvertimeContext,
  ValidationResponseWithMetadata,
} from '@/types/attendance';
import { UserData } from '@/types/user';

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

  // Helper to convert UTC to local time
  const convertToLocalTime = (isoString: string): Date => {
    const date = new Date(isoString);
    if (isoString.includes('Z')) {
      date.setHours(date.getHours() + 7);
    }
    return date;
  };

  const calculateProgressMetrics = React.useCallback(() => {
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

      // Convert UTC times to local for comparison
      const toLocalTime = (timeStr: string) => {
        if (timeStr.includes('Z')) {
          const date = new Date(timeStr);
          date.setHours(date.getHours() + 7); // Convert to Bangkok time
          return date;
        }
        return new Date(timeStr);
      };

      const shiftStart = toLocalTime(currentPeriod.timeWindow.start);
      const shiftEnd = toLocalTime(currentPeriod.timeWindow.end);
      const checkInTime = currentPeriod.activity.checkIn
        ? toLocalTime(currentPeriod.activity.checkIn)
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

      console.log('Progress calculation:', {
        now: now.toLocaleTimeString(),
        shiftStart: shiftStart.toLocaleTimeString(),
        shiftEnd: shiftEnd.toLocaleTimeString(),
        checkInTime: checkInTime.toLocaleTimeString(),
        progressStart: progressStartTime.toLocaleTimeString(),
        elapsed: elapsedMinutes,
        total: totalShiftMinutes,
      });

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

  // Handle check-in/check-out times safely
  const checkInTime = useMemo(() => {
    const rawTime = attendanceStatus.latestAttendance?.CheckInTime;
    if (!rawTime) return '--:--';

    // Extract just the time part HH:mm from the ISO string
    const match = rawTime.toString().match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '--:--';
  }, [attendanceStatus.latestAttendance?.CheckInTime]);

  const checkOutTime = useMemo(() => {
    const rawTime = attendanceStatus.latestAttendance?.CheckOutTime;
    if (!rawTime) return '--:--';

    // Extract just the time part HH:mm from the ISO string
    const match = rawTime.toString().match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '--:--';
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
        <div className="m-4 bg-white rounded-xl shadow-sm overflow-hidden"></div>
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
              const isOvertimePeriod =
                currentPeriod.type === PeriodType.OVERTIME;

              if (isOvertimePeriod) {
                return (
                  <div className="space-y-4">
                    {/* Overtime Progress */}
                    <div>
                      <div className="relative h-3 rounded-full overflow-hidden mb-2">
                        <div className="absolute w-full h-full bg-gray-100" />
                        <div
                          className="absolute h-full bg-yellow-500 transition-all duration-300"
                          style={{
                            width: `${metrics.progressPercent}%`,
                          }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 flex justify-between px-1">
                        <span>{formatSafeTime(overtimeInfo?.startTime)}</span>
                        <span>{formatSafeTime(overtimeInfo?.endTime)}</span>
                      </div>
                    </div>

                    {/* Overtime Times */}
                    <div>
                      <div className="text-sm font-medium mb-2">
                        ช่วงเวลาทำงานล่วงเวลา
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-500 mb-1">
                            เข้า OT
                          </div>
                          <div className="font-medium">
                            {formatSafeTime(overtimeInfo?.startTime)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-500 mb-1">
                            ออก OT
                          </div>
                          <div className="font-medium">
                            {currentPeriod.activity.checkOut
                              ? formatSafeTime(currentPeriod.activity.checkOut)
                              : '--:--'}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 text-yellow-600 text-sm">
                        {currentPeriod.activity.isActive
                          ? 'อยู่ในช่วงเวลาทำงานล่วงเวลา'
                          : 'หมดเวลาทำงานล่วงเวลา'}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {/* Regular Progress */}
                  <div>
                    <div className="relative h-3 rounded-full overflow-hidden mb-2">
                      <div className="absolute w-full h-full bg-gray-100" />
                      <div
                        className="absolute h-full bg-blue-500 transition-all duration-300"
                        style={{
                          width: `${metrics.progressPercent}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 flex justify-between px-1">
                      <span>{formatSafeTime(shiftData?.startTime)}</span>
                      <span>{formatSafeTime(shiftData?.endTime)}</span>
                    </div>
                  </div>

                  {/* Regular Times */}
                  <div>
                    <div className="text-sm font-medium mb-2 flex items-center justify-between">
                      <span>กะปกติ</span>
                      {metrics.lateMinutes > 0 && (
                        <span className="text-xs text-red-600">
                          สาย {metrics.lateMinutes} นาที
                        </span>
                      )}
                      {metrics.earlyMinutes > 0 && (
                        <span className="text-xs text-green-600">
                          เร็ว {metrics.earlyMinutes} นาที
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm text-gray-500 mb-1">
                          เข้างาน
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{checkInTime}</div>
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500 mb-1">ออกงาน</div>
                        <div className="font-medium">{checkOutTime}</div>
                      </div>
                    </div>

                    <div className="mt-3 text-blue-600 text-sm">
                      {currentPeriod.activity.isActive
                        ? 'อยู่ในช่วงเวลาทำงานปกติ'
                        : 'หมดเวลาทำงานปกติ'}
                    </div>
                  </div>
                </div>
              );
            })()}
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

import React, { useMemo } from 'react';
import {
  differenceInMinutes,
  format,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';
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
  ATTENDANCE_CONSTANTS,
} from '@/types/attendance';
import { UserData } from '@/types/user';

interface OvertimeInfo extends OvertimeContext {
  checkIn?: Date | null; // Changed from string to Date
  checkOut?: Date | null;
  isActive: boolean; // From periodState
}

interface MobileAttendanceAppProps {
  userData: UserData;
  shiftData: ShiftData | null;
  currentPeriod: UnifiedPeriodState;
  status: {
    isHoliday: boolean;
    isDayOff: boolean;
  };
  attendanceStatus: AttendanceBaseResponse;
  overtimeInfo?: OvertimeInfo;
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

function formatTime(time: Date | string | null | undefined): string | null {
  if (!time) return null;

  // If it's a Date, convert to string
  const timeString = time instanceof Date ? time.toLocaleTimeString() : time;

  // Your existing formatting logic
  return timeString;
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

  // Add this log
  console.log('MobileAttendanceApp render:', {
    currentPeriod,
    shouldShowProgress:
      status.isDayOff || status.isHoliday
        ? currentPeriod.activity.isOvertime
        : true,
    currentTime: format(currentTime, 'HH:mm'),
  });

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

  const calculateProgressMetrics = React.useCallback(() => {
    console.log('Starting progress metrics calculation:', {
      timeWindow: currentPeriod?.timeWindow,
      activity: currentPeriod?.activity,
      currentTime: format(currentTime, 'HH:mm:ss'),
    });

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
      const shiftStart = parseISO(currentPeriod.timeWindow.start);
      const shiftEnd = parseISO(currentPeriod.timeWindow.end);

      console.log('Time comparisons:', {
        currentTime: format(now, 'HH:mm:ss'),
        shiftStart: format(shiftStart, 'HH:mm:ss'),
        shiftEnd: format(shiftEnd, 'HH:mm:ss'),
        checkIn: currentPeriod.activity.checkIn
          ? format(parseISO(currentPeriod.activity.checkIn), 'HH:mm:ss')
          : 'No check-in',
      });

      // Calculate total shift duration
      const totalShiftMinutes = differenceInMinutes(shiftEnd, shiftStart);

      // If current time is before shift start, no late minutes
      if (now < shiftStart) {
        return {
          lateMinutes: 0,
          earlyMinutes: 0,
          isEarly: false,
          progressPercent: 0,
          totalShiftMinutes,
          isMissed: false,
        };
      }

      // If no check-in yet and we're after shift start
      if (!currentPeriod.activity.checkIn && now > shiftStart) {
        const lateMinutes = differenceInMinutes(now, shiftStart);
        return {
          lateMinutes,
          earlyMinutes: 0,
          isEarly: false,
          progressPercent: 0,
          totalShiftMinutes,
          isMissed: false,
        };
      }

      // If checked in
      if (currentPeriod.activity.checkIn) {
        const checkInTime = parseISO(currentPeriod.activity.checkIn);

        // Calculate early/late minutes
        const earlyMinutes =
          checkInTime < shiftStart
            ? differenceInMinutes(shiftStart, checkInTime)
            : 0;

        const isEarly = earlyMinutes > 0;

        const lateMinutes =
          !isEarly && checkInTime > shiftStart
            ? differenceInMinutes(checkInTime, shiftStart)
            : 0;

        // Calculate progress
        const progressStartTime = isEarly ? shiftStart : checkInTime;
        const elapsedMinutes = differenceInMinutes(now, progressStartTime);
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
      }

      // Default return for other cases
      return {
        lateMinutes: 0,
        earlyMinutes: 0,
        isEarly: false,
        progressPercent: 0,
        totalShiftMinutes,
        isMissed: false,
      };
    } catch (error) {
      console.error('Progress calculation error:', error);
      return {
        lateMinutes: 0,
        earlyMinutes: 0,
        isEarly: false,
        progressPercent: 0,
        totalShiftMinutes: 0,
        isMissed: true,
      };
    }
  }, [currentPeriod, currentTime]);

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
  const metrics = calculateProgressMetrics();
  console.log('Progress metrics calculated:', metrics);

  // Find where shouldShowProgress is determined
  const shouldShowProgress = React.useMemo(() => {
    const show =
      status.isDayOff || status.isHoliday
        ? currentPeriod.activity.isOvertime
        : true;
    console.log('Should show progress determination:', {
      isDayOff: status.isDayOff,
      isHoliday: status.isHoliday,
      isOvertime: currentPeriod.activity.isOvertime,
      shouldShow: show,
    });
    return show;
  }, [status.isDayOff, status.isHoliday, currentPeriod.activity.isOvertime]);

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
              console.log('Rendering progress section with metrics:', {
                metrics,
                currentPeriod,
                timeWindow: currentPeriod.timeWindow,
              });
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
                      <div className="text-sm text-yellow-600 font-medium mb-2">
                        ช่วงเวลาทำงานล่วงเวลา
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm text-gray-500 mb-1">
                            เข้า OT
                          </div>
                          <div className="font-medium">
                            {formatTime(overtimeInfo?.checkIn)}
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
                      <span>เวลางาน</span>
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
                      {(() => {
                        const now = getCurrentTime();
                        const shiftStart = parseISO(
                          currentPeriod.timeWindow.start,
                        );
                        const shiftEnd = parseISO(currentPeriod.timeWindow.end);
                        const earlyThreshold = subMinutes(
                          shiftStart,
                          ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
                        );

                        // After shift end
                        if (now > shiftEnd) {
                          return 'หมดเวลาทำงานปกติ';
                        }

                        // Before early check-in window
                        return 'ยังไม่ถึงเวลาทำงาน';
                      })()}
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

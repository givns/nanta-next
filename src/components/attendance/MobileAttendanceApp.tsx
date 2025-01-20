import React, { useMemo } from 'react';
import {
  addDays,
  format,
  isWithinInterval,
  parseISO,
  subMinutes,
} from 'date-fns';
import { is, th } from 'date-fns/locale';
import { AlertCircle, Clock, User, Building2 } from 'lucide-react';
import { PeriodType } from '@prisma/client';
import { StatusHelpers } from '@/services/Attendance/utils/StatusHelper';
import { getCurrentTime } from '@/utils/dateUtils';
import { formatSafeTime } from '@/shared/timeUtils';
import {
  UserData,
  ShiftData,
  UnifiedPeriodState,
  AttendanceBaseResponse,
  ValidationFlags,
  ExtendedOvertimeInfo,
  ExtendedValidation,
} from '@/types/attendance';

interface ProgressMetrics {
  lateMinutes: number;
  earlyMinutes: number;
  isEarly: boolean;
  progressPercent: number;
  totalShiftMinutes: number;
  isMissed: boolean;
}

interface ProgressSectionProps {
  currentPeriod: UnifiedPeriodState;
  overtimeInfo?: ExtendedOvertimeInfo;
  metrics: ProgressMetrics;
  shiftData: ShiftData | null;
  isOvertimePeriod: boolean;
}

const ProgressSection: React.FC<ProgressSectionProps> = ({
  currentPeriod,
  overtimeInfo,
  metrics,
  shiftData,
  isOvertimePeriod,
}) => {
  const now = getCurrentTime();
  const isEarlyOvertimePeriod =
    currentPeriod.timeWindow.start &&
    parseISO(currentPeriod.timeWindow.start) <
      parseISO(`${format(getCurrentTime(), 'yyyy-MM-dd')}T08:00:00`);

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div>
        <div className="relative h-3 rounded-full overflow-hidden mb-2">
          <div className="absolute w-full h-full bg-gray-100" />
          <div
            className={`absolute h-full transition-all duration-300 ${
              isOvertimePeriod ? 'bg-yellow-500' : 'bg-green-900'
            }`}
            style={{ width: `${Math.min(metrics.progressPercent, 100)}%` }}
          />
        </div>
        <div className="text-xs text-gray-500 flex justify-between px-1">
          <span>
            {formatSafeTime(
              isOvertimePeriod
                ? currentPeriod.timeWindow.start
                : shiftData?.startTime,
            )}
          </span>
          <span>
            {formatSafeTime(
              isOvertimePeriod
                ? currentPeriod.timeWindow.end
                : shiftData?.endTime,
            )}
          </span>
        </div>
      </div>

      {/* Time Information */}
      <div>
        <div className="text-sm font-medium mb-2 flex items-center justify-between">
          <span>
            {isOvertimePeriod
              ? isEarlyOvertimePeriod
                ? 'เวลาทำงานล่วงเวลาก่อนเวลาทำงานปกติ'
                : 'เวลาทำงานล่วงเวลา'
              : 'เวลาทำงาน'}
          </span>
          {!isOvertimePeriod && (
            <>
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
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">
              {isOvertimePeriod ? 'เข้า OT' : 'เข้างาน'}
            </div>
            <div className="font-medium">
              {formatSafeTime(currentPeriod.activity.checkIn)}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">
              {isOvertimePeriod ? 'ออก OT' : 'ออกงาน'}
            </div>
            <div className="font-medium">
              {formatSafeTime(currentPeriod.activity.checkOut) || '--:--'}
            </div>
          </div>
        </div>

        {/* Overtime Additional Info */}
        {isOvertimePeriod && overtimeInfo && (
          <div className="mt-3 text-sm text-gray-500">
            <div>ระยะเวลา OT: {overtimeInfo.durationMinutes} นาที</div>
            {overtimeInfo.reason && (
              <div className="mt-1">เหตุผล: {overtimeInfo.reason}</div>
            )}
          </div>
        )}

        {/* Status Message */}
        <div
          className={`mt-3 ${isOvertimePeriod ? 'text-yellow-600' : 'text-green-800'} text-sm`}
        >
          {(() => {
            if (isOvertimePeriod) {
              // Get the target overtime window
              const targetOvertime = overtimeInfo && {
                start: parseISO(
                  `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
                ),
                end: parseISO(
                  `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.endTime}`,
                ),
              };

              // If no target overtime found, return empty
              if (!targetOvertime) return '';

              // For overnight periods, adjust end time
              const adjustedEnd =
                targetOvertime.end < targetOvertime.start
                  ? addDays(targetOvertime.end, 1)
                  : targetOvertime.end;

              // Early overtime check (before regular shift)
              const isEarlyOvertimePeriod = Boolean(
                overtimeInfo &&
                  overtimeInfo.startTime &&
                  parseInt(overtimeInfo.startTime.split(':')[0], 10) <
                    parseInt(shiftData?.startTime?.split(':')[0] || '08', 10),
              );

              // Check if it's an upcoming overtime
              const isUpcoming = now < targetOvertime.start;
              if (isUpcoming) {
                const approachWindow = subMinutes(targetOvertime.start, 30);
                if (now >= approachWindow) {
                  return 'กำลังจะถึงเวลาทำงานล่วงเวลา';
                }
                return `รอเริ่มเวลาทำงานล่วงเวลา ${format(targetOvertime.start, 'HH:mm')} น.`;
              }

              // Regular overtime status
              if (now > adjustedEnd) {
                return 'หมดเวลาทำงานล่วงเวลา';
              }

              if (isEarlyOvertimePeriod) {
                return 'อยู่ในช่วงเวลาทำงานล่วงเวลาก่อนเวลาทำงานปกติ';
              }

              return 'อยู่ในช่วงเวลาทำงานล่วงเวลา';
            }

            // Regular period checks...
            const shiftStart = shiftData
              ? parseISO(`${format(now, 'yyyy-MM-dd')}T${shiftData.startTime}`)
              : null;
            const shiftEnd = shiftData
              ? parseISO(`${format(now, 'yyyy-MM-dd')}T${shiftData.endTime}`)
              : null;

            if (!shiftStart || !shiftEnd) return '';

            const earlyWindow = {
              start: subMinutes(shiftStart, 30),
              end: shiftStart,
            };

            // Has upcoming overtime
            if (overtimeInfo?.startTime) {
              const overtimeStart = parseISO(
                `${format(now, 'yyyy-MM-dd')}T${overtimeInfo.startTime}`,
              );
              const approachingOvertime = isWithinInterval(now, {
                start: subMinutes(overtimeStart, 30),
                end: overtimeStart,
              });

              if (approachingOvertime) {
                return `กำลังจะถึงเวลาทำงานล่วงเวลา (${format(overtimeStart, 'HH:mm')} น.)`;
              }
            }

            if (now > shiftEnd) return 'หมดเวลาทำงานปกติ';
            if (isWithinInterval(now, earlyWindow)) return 'ยังไม่ถึงเวลาทำงาน';
            if (now < earlyWindow.start) return 'ยังไม่ถึงเวลาทำงาน';
            return 'อยู่ในเวลาทำงานปกติ';
          })()}
        </div>
      </div>
    </div>
  );
};

interface MobileAttendanceAppProps {
  userData: UserData;
  shiftData: ShiftData | null;
  currentPeriod: UnifiedPeriodState;
  status: {
    isHoliday: boolean;
    isDayOff: boolean;
  };
  attendanceStatus: AttendanceBaseResponse;
  overtimeInfo?: ExtendedOvertimeInfo;
  validation: ExtendedValidation;
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
  locationState,
}) => {
  const currentTime = getCurrentTime();

  const shouldShowProgress = useMemo(
    () =>
      status.isDayOff || status.isHoliday
        ? currentPeriod.activity.isOvertime
        : true,
    [status.isDayOff, status.isHoliday, currentPeriod.activity.isOvertime],
  );

  const metrics = useMemo((): ProgressMetrics => {
    const now = getCurrentTime();
    console.log('Progress Calculation Input:', {
      currentTime: format(now, 'yyyy-MM-dd HH:mm:ss'),
      currentPeriod: {
        timeWindow: currentPeriod?.timeWindow,
        activity: currentPeriod?.activity,
        type: currentPeriod?.type,
      },
      latestAttendance: attendanceStatus.latestAttendance
        ? {
            checkIn: attendanceStatus.latestAttendance.CheckInTime,
            checkOut: attendanceStatus.latestAttendance.CheckOutTime,
            shiftStart: attendanceStatus.latestAttendance.shiftStartTime,
            shiftEnd: attendanceStatus.latestAttendance.shiftEndTime,
          }
        : null,
    });

    // For overnight active overtime
    if (
      currentPeriod.activity.isOvertime &&
      attendanceStatus.latestAttendance?.CheckInTime &&
      !attendanceStatus.latestAttendance?.CheckOutTime
    ) {
      const shiftStart = parseISO(
        attendanceStatus.latestAttendance.shiftStartTime || '',
      );
      const shiftEnd = parseISO(
        attendanceStatus.latestAttendance.shiftEndTime || '',
      );
      const overtimeStart = parseISO(currentPeriod.timeWindow.start);
      const overtimeEnd = parseISO(currentPeriod.timeWindow.end);

      let elapsedMinutes;
      let totalMinutes;

      if (now < overtimeStart) {
        // If current time is before overtime start, use shift duration
        totalMinutes =
          Math.abs(shiftEnd.getTime() - shiftStart.getTime()) / 60000;
        elapsedMinutes =
          Math.abs(shiftEnd.getTime() - shiftStart.getTime()) / 60000;
      } else {
        // If current time is within or after overtime period
        totalMinutes =
          Math.abs(overtimeEnd.getTime() - overtimeStart.getTime()) / 60000;
        elapsedMinutes = Math.max(
          0,
          Math.min(
            totalMinutes,
            (now.getTime() - overtimeStart.getTime()) / 60000,
          ),
        );
      }

      const progress = Math.min((elapsedMinutes / totalMinutes) * 100, 100);

      console.log('Overnight OT Progress Calculation:', {
        shiftStart: format(shiftStart, 'yyyy-MM-dd HH:mm:ss'),
        shiftEnd: format(shiftEnd, 'yyyy-MM-dd HH:mm:ss'),
        overtimeStart: format(overtimeStart, 'yyyy-MM-dd HH:mm:ss'),
        overtimeEnd: format(overtimeEnd, 'yyyy-MM-dd HH:mm:ss'),
        now: format(now, 'yyyy-MM-dd HH:mm:ss'),
        elapsedMinutes,
        totalMinutes,
        progress,
      });

      return {
        lateMinutes: 0,
        earlyMinutes: 0,
        isEarly: false,
        progressPercent: progress,
        totalShiftMinutes: totalMinutes,
        isMissed: false,
      };
    }

    // Rest of the code for non-overnight periods...
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

    const periodStart = parseISO(currentPeriod.timeWindow.start);
    const periodEnd = parseISO(currentPeriod.timeWindow.end);

    console.log('Time boundaries:', {
      now: format(now, 'yyyy-MM-dd HH:mm:ss'),
      periodStart: format(periodStart, 'yyyy-MM-dd HH:mm:ss'),
      periodEnd: format(periodEnd, 'yyyy-MM-dd HH:mm:ss'),
      isOvertime: currentPeriod.activity.isOvertime,
      usingAttendanceEnd: Boolean(
        currentPeriod.activity.isOvertime &&
          attendanceStatus.latestAttendance?.shiftEndTime,
      ),
    });

    const checkIn = currentPeriod.activity.checkIn
      ? parseISO(currentPeriod.activity.checkIn)
      : null;

    const totalMinutes =
      Math.abs(periodEnd.getTime() - periodStart.getTime()) / 60000;

    console.log('Check-in state:', {
      hasCheckIn: !!checkIn,
      checkInTime: checkIn ? format(checkIn, 'yyyy-MM-dd HH:mm:ss') : null,
      totalPeriodMinutes: totalMinutes,
    });

    if (!checkIn) {
      if (now < periodStart) {
        console.log('Before period start, no progress');
        return {
          lateMinutes: 0,
          earlyMinutes: 0,
          isEarly: false,
          progressPercent: 0,
          totalShiftMinutes: totalMinutes,
          isMissed: false,
        };
      }

      const progress = Math.min(
        ((now.getTime() - periodStart.getTime()) /
          (periodEnd.getTime() - periodStart.getTime())) *
          100,
        100,
      );

      console.log('Progress without check-in:', {
        progress,
        elapsedMinutes: (now.getTime() - periodStart.getTime()) / 60000,
      });

      return {
        lateMinutes: Math.max(
          0,
          (now.getTime() - periodStart.getTime()) / 60000,
        ),
        earlyMinutes: 0,
        isEarly: false,
        progressPercent: progress,
        totalShiftMinutes: totalMinutes,
        isMissed: false,
      };
    }

    const isEarly = checkIn < periodStart;
    const progressStart = isEarly ? periodStart : checkIn;
    const elapsedMinutes = Math.max(
      0,
      (now.getTime() - progressStart.getTime()) / 60000,
    );
    const progress = Math.min((elapsedMinutes / totalMinutes) * 100, 100);

    console.log('Final progress calculation:', {
      isEarly,
      progressStartTime: format(progressStart, 'yyyy-MM-dd HH:mm:ss'),
      elapsedMinutes,
      calculatedProgress: progress,
      earlyMinutes: isEarly
        ? (periodStart.getTime() - checkIn.getTime()) / 60000
        : 0,
      lateMinutes: !isEarly
        ? (checkIn.getTime() - periodStart.getTime()) / 60000
        : 0,
    });

    return {
      lateMinutes: !isEarly
        ? Math.max(0, (checkIn.getTime() - periodStart.getTime()) / 60000)
        : 0,
      earlyMinutes: isEarly
        ? Math.max(0, (periodStart.getTime() - checkIn.getTime()) / 60000)
        : 0,
      isEarly,
      progressPercent: progress,
      totalShiftMinutes: totalMinutes,
      isMissed: false,
    };
  }, [currentPeriod, attendanceStatus.latestAttendance]);

  const isOvertimePeriod = currentPeriod.type === PeriodType.OVERTIME;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
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
                  {StatusHelpers.getDisplayStatus({
                    state: attendanceStatus.state,
                    checkStatus: attendanceStatus.checkStatus,
                    isOvertime: attendanceStatus.periodInfo.isOvertime,
                    overtimeState: attendanceStatus.periodInfo.overtimeState,
                  })}
                </span>
              </div>
              {isOvertimePeriod && (
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
                  เวลาทำงานปกติ {formatSafeTime(shiftData.startTime)} -{' '}
                  {formatSafeTime(shiftData.endTime)} น.
                </div>
              )}

            {/* Overtime Information */}
            {overtimeInfo && (
              <div className="text-sm text-gray-500 mt-1">
                {/* Title and time */}
                <div>
                  {!attendanceStatus.latestAttendance?.CheckOutTime &&
                  !status.isDayOff
                    ? 'มีการทำงานล่วงเวลาวันนี้: '
                    : 'เวลาทำงานล่วงเวลา: '}
                  {formatSafeTime(overtimeInfo.startTime)} -{' '}
                  {formatSafeTime(overtimeInfo.endTime)} น.
                  {overtimeInfo.durationMinutes && (
                    <span className="ml-2">
                      ({overtimeInfo.durationMinutes} นาที)
                    </span>
                  )}
                </div>
                {/* Add reason */}
                {overtimeInfo.reason && (
                  <div className="mt-1 flex gap-2">
                    <span className="text-gray-400">เหตุผล:</span>
                    <span>{overtimeInfo.reason}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Progress Section */}
          {shouldShowProgress && (
            <div className="p-4">
              <ProgressSection
                currentPeriod={currentPeriod}
                overtimeInfo={overtimeInfo}
                metrics={metrics}
                shiftData={shiftData}
                isOvertimePeriod={isOvertimePeriod}
              />
            </div>
          )}
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

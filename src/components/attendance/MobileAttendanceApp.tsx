import React, { useMemo } from 'react';
import { format, isWithinInterval, parseISO, subMinutes } from 'date-fns';
import { th } from 'date-fns/locale';
import { AlertCircle, Clock, User, Building2 } from 'lucide-react';
import { AttendanceState, CheckStatus, PeriodType } from '@prisma/client';
import { StatusHelpers } from '@/services/Attendance/utils/StatusHelper';
import { getCurrentTime } from '@/utils/dateUtils';
import { formatSafeTime } from '@/shared/timeUtils';
import {
  UserData,
  ShiftData,
  UnifiedPeriodState,
  AttendanceBaseResponse,
} from '@/types/attendance';

interface ProgressMetrics {
  lateMinutes: number;
  earlyMinutes: number;
  isEarly: boolean;
  progressPercent: number;
  totalShiftMinutes: number;
  isMissed: boolean;
}

interface ExtendedOvertimeInfo {
  checkIn?: Date | null;
  checkOut?: Date | null;
  isActive: boolean;
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string;
  validationWindow?: {
    earliestCheckIn: Date;
    latestCheckOut: Date;
  };
}

interface ValidationFlags {
  isCheckingIn: boolean;
  isLateCheckIn: boolean;
  isEarlyCheckOut: boolean;
  isPlannedHalfDayLeave: boolean;
  isEmergencyLeave: boolean;
  isOvertime: boolean;
  requireConfirmation: boolean;
  isDayOffOvertime: boolean;
  isInsideShift: boolean;
  isAutoCheckIn: boolean;
  isAutoCheckOut: boolean;
}

interface ValidationMetadata {
  missingEntries: any[];
  transitionWindow?: {
    start: string;
    end: string;
    targetPeriod: PeriodType;
  };
}

interface ExtendedValidation {
  allowed: boolean;
  reason: string;
  flags: ValidationFlags;
  metadata: ValidationMetadata;
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

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div>
        <div className="relative h-3 rounded-full overflow-hidden mb-2">
          <div className="absolute w-full h-full bg-gray-100" />
          <div
            className={`absolute h-full transition-all duration-300 ${
              isOvertimePeriod ? 'bg-yellow-500' : 'bg-blue-500'
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
          <span>{isOvertimePeriod ? 'เวลาทำงานล่วงเวลา' : 'เวลาทำงาน'}</span>
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
        <div className="mt-3 text-blue-600 text-sm">
          {(() => {
            if (isOvertimePeriod) {
              const isPastEndTime =
                now > parseISO(currentPeriod.timeWindow.end);
              return isPastEndTime
                ? 'หมดเวลาทำงานล่วงเวลา'
                : 'อยู่ในช่วงเวลาทำงานล่วงเวลา';
            }

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

  // Calculate progress metrics
  const metrics = useMemo((): ProgressMetrics => {
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

    const now = getCurrentTime();
    const periodStart = parseISO(currentPeriod.timeWindow.start);
    const periodEnd = parseISO(currentPeriod.timeWindow.end);
    const checkIn = currentPeriod.activity.checkIn
      ? parseISO(currentPeriod.activity.checkIn)
      : null;

    const totalMinutes =
      Math.abs(periodEnd.getTime() - periodStart.getTime()) / 60000;

    if (!checkIn) {
      if (now < periodStart)
        return {
          lateMinutes: 0,
          earlyMinutes: 0,
          isEarly: false,
          progressPercent: 0,
          totalShiftMinutes: totalMinutes,
          isMissed: false,
        };

      const progress = Math.min(
        ((now.getTime() - periodStart.getTime()) /
          (periodEnd.getTime() - periodStart.getTime())) *
          100,
        100,
      );

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
  }, [currentPeriod]);

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
                  เวลางาน {formatSafeTime(shiftData.startTime)} -{' '}
                  {formatSafeTime(shiftData.endTime)} น.
                </div>
              )}

            {/* Overtime Information */}
            {overtimeInfo && (
              <div className="text-sm text-gray-500 mt-1">
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

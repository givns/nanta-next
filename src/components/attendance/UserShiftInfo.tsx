import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Clock1 from '@/components/attendance/Clock';
import {
  ApprovedOvertimeInfo,
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  CurrentPeriodInfo,
  LatestAttendance,
  PeriodType,
  ShiftData,
  UserData,
} from '@/types/attendance';
import { getStatusMessage } from './StatusMessage';
import AttendanceProgress from './AttendanceProgress';
import OvertimeCard from './OvertimeCard';

interface UserShiftInfoProps {
  userData: UserData;
  status: {
    state: AttendanceState;
    checkStatus: CheckStatus;
    currentPeriod: CurrentPeriodInfo | null;
    isHoliday: boolean;
    isDayOff: boolean;
    isOvertime: boolean;
    approvedOvertime: ApprovedOvertimeInfo | null; // Changed from optional to nullable
    latestAttendance: LatestAttendance;
  };
  effectiveShift: ShiftData | null;
  isLoading?: boolean;
}

interface StatusIndicatorProps {
  message: string;
  color: 'red' | 'green' | 'blue';
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  message,
  color,
}) => (
  <div
    className={`mt-4 inline-flex items-center px-3 py-1 rounded-full text-sm`}
    style={{
      backgroundColor: `rgba(${
        color === 'red'
          ? '239, 68, 68'
          : color === 'green'
            ? '34, 197, 94'
            : '59, 130, 246'
      }, 0.1)`,
    }}
  >
    <div className={`w-2 h-2 rounded-full bg-${color}-500 mr-2`}></div>
    <span className={`text-${color}-700`}>{message}</span>
  </div>
);

// Determine status message and color
export const UserShiftInfo: React.FC<UserShiftInfoProps> = ({
  userData,
  status,
  effectiveShift,
  isLoading = false,
}) => {
  const today = new Date();

  // Fixed status construction
  const statusDisplay = useMemo(() => {
    if (!status)
      return { message: 'ไม่พบข้อมูลการลงเวลา', color: 'red' as const };

    const currentPeriod = {
      type: status.currentPeriod?.type ?? PeriodType.REGULAR,
      isComplete: status.currentPeriod?.isComplete ?? false,
      checkInTime: status.currentPeriod?.checkInTime ?? null,
      checkOutTime: status.currentPeriod?.checkOutTime ?? null,
      current: {
        start: new Date(status.currentPeriod?.current.start ?? new Date()),
        end: new Date(status.currentPeriod?.current.end ?? new Date()),
      },
      overtimeId: status.currentPeriod?.overtimeId,
    };

    const statusInfo: AttendanceStatusInfo = {
      state: status.state,
      checkStatus: status.checkStatus,
      currentPeriod,
      isHoliday: status.isHoliday,
      isDayOff: status.isDayOff,
      isOvertime: status.isOvertime,
      latestAttendance: {
        id: status.latestAttendance?.id ?? '',
        employeeId: status.latestAttendance?.employeeId ?? '',
        date: status.latestAttendance?.date ?? new Date().toISOString(),
        regularCheckInTime: status.latestAttendance?.regularCheckInTime ?? null,
        regularCheckOutTime:
          status.latestAttendance?.regularCheckOutTime ?? null,
        state: status.latestAttendance?.state ?? AttendanceState.ABSENT,
        checkStatus:
          status.latestAttendance?.checkStatus ?? CheckStatus.PENDING,
        overtimeState: status.latestAttendance?.overtimeState,
        isManualEntry: status.latestAttendance?.isManualEntry ?? false,
        isDayOff: status.latestAttendance?.isDayOff ?? false,
        shiftStartTime: status.latestAttendance?.shiftStartTime,
        shiftEndTime: status.latestAttendance?.shiftEndTime,
      },
      approvedOvertime: status.approvedOvertime ?? null,
      overtimeEntries: [],
      detailedStatus: '',
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      user: userData,
      isCheckingIn: !status.latestAttendance?.regularCheckInTime,
      dayOffType: status.isHoliday
        ? 'holiday'
        : status.isDayOff
          ? 'weekly'
          : 'none',
      isOutsideShift: false,
      isLate: false,
      shiftAdjustment: null,
      futureShifts: [],
      futureOvertimes: [],
      overtimeAttendances: [],
      pendingLeaveRequest: false,
    };

    return getStatusMessage(statusInfo);
  }, [status, userData]);

  if (isLoading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow animate-pulse space-y-4">
        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Employee Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="text-2xl font-bold">
                {userData.name}
              </CardTitle>
              <p className="text-gray-600">
                รหัสพนักงาน: {userData.employeeId}
              </p>
              <p className="text-gray-600">แผนก: {userData.departmentName}</p>
            </div>
            <div className="flex flex-col items-center">
              <Clock1 />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Status and Progress Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center">
              <Calendar className="mr-2" /> สถานะการทำงาน
            </CardTitle>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-700">
                {format(today, 'd', { locale: th })}
              </p>
              <p className="text-sm text-gray-500">
                {format(today, 'EEEE', { locale: th })}
              </p>
              <p className="text-sm text-gray-500">
                {format(today, 'MMMM yyyy', { locale: th })}
              </p>
            </div>
          </div>
          <StatusIndicator
            message={statusDisplay.message}
            color={statusDisplay.color}
          />
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Special Status Messages */}
          {(status.isHoliday || status.isDayOff) && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <h4 className="text-md font-semibold text-blue-700">
                {status.isHoliday ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุดประจำสัปดาห์'}
              </h4>
              {status.approvedOvertime && (
                <p className="text-gray-600 mt-2">
                  *มีการอนุมัติทำงานล่วงเวลาในวันหยุด
                </p>
              )}
            </div>
          )}

          {/* Progress Section */}
          <div className="space-y-4">
            {/* Show shift info for regular days or overtime */}
            {(!status.isHoliday || status.approvedOvertime) && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  {status.approvedOvertime
                    ? 'ช่วงเวลาทำงานล่วงเวลา'
                    : 'เวลาทำงานปกติ'}
                </h4>
                <AttendanceProgress
                  effectiveShift={effectiveShift}
                  currentPeriod={status.currentPeriod}
                  latestAttendance={status.latestAttendance}
                  approvedOvertime={status.approvedOvertime}
                />
              </div>
            )}

            {/* Time Records */}
            {status.latestAttendance && (
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                {status.latestAttendance.regularCheckInTime && (
                  <div>
                    <p className="text-gray-600">เวลาเข้างาน</p>
                    <p className="font-medium text-lg">
                      {format(
                        new Date(status.latestAttendance.regularCheckInTime),
                        'HH:mm',
                      )}
                    </p>
                  </div>
                )}
                {status.latestAttendance.regularCheckOutTime && (
                  <div>
                    <p className="text-gray-600">เวลาออกงาน</p>
                    <p className="font-medium text-lg">
                      {format(
                        new Date(status.latestAttendance.regularCheckOutTime),
                        'HH:mm',
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Overtime Card */}
          {status.approvedOvertime && (
            <OvertimeCard
              approvedOvertime={status.approvedOvertime}
              currentPeriod={status.currentPeriod}
              latestAttendance={status.latestAttendance}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default React.memo(UserShiftInfo);

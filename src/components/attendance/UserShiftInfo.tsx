import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Clock, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Clock1 from '@/components/attendance/Clock';
import {
  AttendanceState,
  AttendanceStatusInfo,
  CheckStatus,
  CurrentPeriodInfo,
  PeriodType,
  ShiftData,
  UserData,
} from '@/types/attendance';
import { getStatusMessage } from './StatusMessage';

interface UserShiftInfoProps {
  userData: UserData;
  status: {
    state: AttendanceState;
    checkStatus: CheckStatus;
    currentPeriod: CurrentPeriodInfo | null;
    isHoliday: boolean;
    isDayOff: boolean;
    isOvertime: boolean;
    latestAttendance?: {
      regularCheckInTime?: Date;
      regularCheckOutTime?: Date;
      overtimeCheckInTime?: Date;
      overtimeCheckOutTime?: Date;
      isLateCheckIn?: boolean;
      isOvertime?: boolean;
    };
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

export const UserShiftInfo: React.FC<UserShiftInfoProps> = ({
  userData,
  status,
  effectiveShift,
  isLoading = false,
}) => {
  const today = new Date();

  // Determine status message and color
  const statusDisplay = useMemo(() => {
    const statusInfo: AttendanceStatusInfo = {
      state: status.state,
      checkStatus: status.checkStatus,
      isHoliday: status.isHoliday,
      isDayOff: status.isDayOff,
      isOvertime: status.isOvertime,
      approvedOvertime: null, // Add this
      currentPeriod: {
        type: status.currentPeriod?.type ?? PeriodType.REGULAR,
        isComplete: status.currentPeriod?.isComplete ?? false,
        checkInTime: status.currentPeriod?.checkInTime,
        checkOutTime: status.currentPeriod?.checkOutTime,
        current: status.currentPeriod?.current ?? {
          start: new Date(),
          end: new Date(),
        },
      },
      latestAttendance: status.latestAttendance
        ? {
            id: '', // Required by LatestAttendance type
            employeeId: '', // Required
            date: new Date().toISOString(),
            regularCheckInTime:
              status.latestAttendance.regularCheckInTime?.toISOString() ?? null,
            regularCheckOutTime:
              status.latestAttendance.regularCheckOutTime?.toISOString() ??
              null,
            state: status.state,
            checkStatus: status.checkStatus,
            isManualEntry: false,
            isDayOff: status.isDayOff,
          }
        : null,
      overtimeEntries: [],
      detailedStatus: '',
      isEarlyCheckIn: false,
      isLateCheckIn: false,
      isLateCheckOut: false,
      user: userData,
      isCheckingIn: false,
      dayOffType: 'holiday',
      isOutsideShift: false,
      isLate: false,
      shiftAdjustment: null,
      futureShifts: [],
      futureOvertimes: [],
      overtimeAttendances: [],
      pendingLeaveRequest: false,
    };

    return getStatusMessage(statusInfo);
  }, [status]);

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
      {/* User Info Card */}
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            <Clock1 />
          </div>
          <CardTitle className="text-2xl">{userData.name}</CardTitle>
          <p className="text-xl text-gray-600">
            รหัสพนักงาน: {userData.employeeId}
          </p>
          <p className="text-gray-600">แผนก: {userData.departmentName}</p>
          <StatusIndicator
            message={statusDisplay.message}
            color={statusDisplay.color}
          />
        </CardHeader>
      </Card>

      {/* Today's Info */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center">
              <Calendar className="mr-2" /> ข้อมูลการทำงานวันนี้
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
        </CardHeader>
        <CardContent>
          {(status.isHoliday || status.isDayOff) && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              <h4 className="text-md font-semibold mb-2 text-blue-700">
                {status.isHoliday ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุดประจำสัปดาห์'}
              </h4>
              {status.isOvertime && (
                <p className="text-gray-600 mt-2">
                  *มีการอนุมัติทำงานล่วงเวลาในวันหยุด
                </p>
              )}
            </div>
          )}

          {!status.isHoliday && !status.isDayOff && effectiveShift && (
            <div className="mb-4">
              <p className="text-gray-800">
                <span className="font-medium">{effectiveShift.name}</span>
              </p>
              <p className="text-gray-600 flex items-center mt-1">
                <Clock className="mr-2" size={16} />
                {effectiveShift.startTime} - {effectiveShift.endTime}
              </p>
            </div>
          )}

          {/* Time Records */}
          {status.latestAttendance && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              {status.latestAttendance.regularCheckInTime && (
                <div>
                  <p className="text-gray-600">เวลาเข้างาน</p>
                  <p className="font-medium">
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
                  <p className="font-medium">
                    {format(
                      new Date(status.latestAttendance.regularCheckOutTime),
                      'HH:mm',
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Overtime Info */}
          {status.isOvertime && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <h4 className="text-md font-semibold mb-2 flex items-center">
                <AlertCircle className="mr-2" size={18} />
                การทำงานล่วงเวลา
              </h4>
              {status.currentPeriod?.overtimeId && (
                <p className="text-sm text-gray-600">
                  * กำลังอยู่ในช่วงเวลาทำงานล่วงเวลา
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default React.memo(UserShiftInfo);

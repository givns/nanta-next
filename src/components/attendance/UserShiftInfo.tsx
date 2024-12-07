import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import Clock1 from '@/components/attendance/Clock';
import {
  AttendanceState,
  CheckStatus,
  CurrentPeriodInfo,
  LatestAttendance,
  ShiftData,
  UserData,
} from '@/types/attendance';
import UnifiedAttendanceStatus from './UnifiedAttendanceStatus';
import OvertimeCard from './OvertimeCard';
import { last } from 'lodash';

interface OvertimeInfoUI {
  id: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isInsideShiftHours: boolean;
  isDayOffOvertime: boolean;
  reason?: string;
}

interface UserShiftInfoProps {
  userData: UserData;
  status: {
    state: AttendanceState;
    checkStatus: CheckStatus;
    currentPeriod: CurrentPeriodInfo | null;
    isHoliday: boolean;
    isDayOff: boolean;
    isOvertime: boolean;
    latestAttendance: LatestAttendance;
    approvedOvertime: OvertimeInfoUI | null;
  };
  effectiveShift: ShiftData | null;
  isLoading?: boolean;
}

export const UserShiftInfo: React.FC<UserShiftInfoProps> = ({
  userData,
  status,
  effectiveShift,
  isLoading = false,
}) => {
  const today = new Date();

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
              <div className="flex flex-col items-center">
                <Clock1 />
              </div>
              <CardTitle className="text-2xl text-center font-bold">
                {userData.name}
              </CardTitle>
              <p className="text-gray-600">
                รหัสพนักงาน: {userData.employeeId}
              </p>
              <p className="text-gray-600">แผนก: {userData.departmentName}</p>
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
        </CardHeader>

        <CardContent className="space-y-6">
          <UnifiedAttendanceStatus
            effectiveShift={effectiveShift}
            currentPeriod={status.currentPeriod}
            latestAttendance={status.latestAttendance}
            approvedOvertime={status.approvedOvertime}
            state={status.state}
            checkStatus={status.checkStatus}
            isHoliday={status.isHoliday}
            isDayOff={status.isDayOff}
            isOvertime={status.isOvertime}
          />

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

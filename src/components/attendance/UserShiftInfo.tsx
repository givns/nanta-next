import React, { useMemo } from 'react';
import { UserData } from '@/types/user';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Clock, AlertCircle, User } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useStatusMessage } from '@/hooks/useStatusMessage';
import {
  AttendanceBaseResponse,
  ShiftWindowResponse,
} from '@/types/attendance';

interface UserShiftInfoProps {
  userData: UserData;
  window?: ShiftWindowResponse;
  status?: AttendanceBaseResponse;
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
  window,
  status,
  isLoading = false,
}) => {
  const { message, color } = useStatusMessage(status);
  const today = new Date();

  const renderLoadingState = () => (
    <div className="p-4 bg-white rounded-lg shadow animate-pulse space-y-4">
      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
    </div>
  );

  const renderHolidayInfo = useMemo(() => {
    if (!window?.isHoliday && !window?.isDayOff) return null;

    return (
      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
        <h4 className="text-md font-semibold mb-2 text-blue-700">
          {window.isHoliday ? 'วันหยุดนักขัตฤกษ์' : 'วันหยุดประจำสัปดาห์'}
        </h4>
        {window.holidayInfo && (
          <p className="text-blue-600">{window.holidayInfo.name}</p>
        )}
        {window.overtimeInfo && (
          <p className="text-gray-600 mt-2">
            *มีการอนุมัติทำงานล่วงเวลาในวันหยุด
          </p>
        )}
      </div>
    );
  }, [
    window?.isHoliday,
    window?.isDayOff,
    window?.holidayInfo,
    window?.overtimeInfo,
  ]);

  const renderShiftTimes = useMemo(() => {
    if (!window?.current) return null;

    const times = [];
    if (status?.latestAttendance?.regularCheckInTime) {
      times.push(
        <div key="checkin">
          <p className="text-gray-600">เวลาเข้างาน</p>
          <p className="font-medium">
            {format(
              new Date(status.latestAttendance.regularCheckInTime),
              'HH:mm',
            )}
          </p>
        </div>,
      );
    }

    if (status?.latestAttendance?.regularCheckOutTime) {
      times.push(
        <div key="checkout">
          <p className="text-gray-600">เวลาออกงาน</p>
          <p className="font-medium">
            {format(
              new Date(status.latestAttendance.regularCheckOutTime),
              'HH:mm',
            )}
          </p>
        </div>,
      );
    }

    if (times.length > 0) {
      return <div className="grid grid-cols-2 gap-4 mb-4">{times}</div>;
    }

    return null;
  }, [window?.current, status?.latestAttendance]);

  const renderOvertimeInfo = useMemo(() => {
    if (!window?.overtimeInfo) return null;

    return (
      <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
        <h4 className="text-md font-semibold mb-2 flex items-center">
          <AlertCircle className="mr-2" size={18} />
          การทำงานล่วงเวลา
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-600">เวลาที่อนุมัติ</p>
            <p className="font-medium">
              {window.overtimeInfo.startTime} - {window.overtimeInfo.endTime}
            </p>
          </div>
          {status?.latestAttendance?.overtimeCheckInTime && (
            <div>
              <p className="text-gray-600">เวลาทำงานจริง</p>
              <p className="font-medium">
                {format(
                  new Date(status.latestAttendance.overtimeCheckInTime),
                  'HH:mm',
                )}{' '}
                -
                {status.latestAttendance.overtimeCheckOutTime
                  ? format(
                      new Date(status.latestAttendance.overtimeCheckOutTime),
                      'HH:mm',
                    )
                  : 'ยังไม่สิ้นสุด'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }, [window?.overtimeInfo, status?.latestAttendance]);

  if (isLoading) return renderLoadingState();

  return (
    <div className="space-y-4">
      {/* User Info Card */}
      <Card>
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-2">
            <User className="w-12 h-12 text-gray-400" />
          </div>
          <CardTitle className="text-2xl">{userData.name}</CardTitle>
          <p className="text-xl text-gray-600">
            รหัสพนักงาน: {userData.employeeId}
          </p>
          <p className="text-gray-600">แผนก: {userData.departmentName}</p>
          <StatusIndicator message={message} color={color} />
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
          {renderHolidayInfo}

          {!window?.isHoliday && !window?.isDayOff && window?.shift && (
            <div className="mb-4">
              <p className="text-gray-800">
                <span className="font-medium">{window.shift.name}</span>
              </p>
              <p className="text-gray-600 flex items-center mt-1">
                <Clock className="mr-2" size={16} />
                {window.shift.startTime} - {window.shift.endTime}
              </p>
              {window.isAdjusted && (
                <p className="text-blue-600 mt-2 text-sm">
                  * เวลาทำงานได้รับการปรับเปลี่ยนสำหรับวันนี้
                </p>
              )}
            </div>
          )}

          {renderShiftTimes}
          {renderOvertimeInfo}
        </CardContent>
      </Card>

      {/* Future Shifts/Events */}
      {window?.futureShifts && window.futureShifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>การปรับเปลี่ยนกะการทำงาน</CardTitle>
          </CardHeader>
          <CardContent>
            {window.futureShifts.map((adjustment, index) => (
              <div
                key={`${adjustment.date}-${index}`}
                className="mb-4 last:mb-0"
              >
                <p className="font-medium">
                  {format(new Date(adjustment.date), 'd MMM yyyy', {
                    locale: th,
                  })}
                </p>
                <p className="text-gray-600">{adjustment.shift.name}</p>
                <p className="text-sm text-gray-500">
                  {adjustment.shift.startTime} - {adjustment.shift.endTime}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default React.memo(UserShiftInfo);

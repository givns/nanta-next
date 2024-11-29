import React, { useCallback, useMemo } from 'react';
import { UserData } from '../../types/user';
import { format, isToday, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Clock, Briefcase, AlertCircle } from 'lucide-react';
import {
  AttendanceStatusInfo,
  OvertimeAttendanceInfo,
  ShiftData,
} from '@/types/attendance';
import { getStatusMessage } from './StatusMessage';
import { OvertimePeriodInfo } from './OvertimePeriodInfo';

interface UserShiftInfoProps {
  userData: UserData;
  attendanceStatus: AttendanceStatusInfo | null;
  effectiveShift: ShiftData | null;
  isLoading: boolean;
  locationReady?: boolean; // Add location ready state
}

const UserShiftInfo = React.memo(
  ({
    userData,
    attendanceStatus,
    effectiveShift,
    isLoading,
    locationReady = true, // Default to true for backward compatibility
  }: UserShiftInfoProps) => {
    const { message, color } = useMemo(
      () => getStatusMessage(attendanceStatus),
      [attendanceStatus],
    );

    const { activeOvertimes, futureOvertimes } = useMemo(() => {
      if (!attendanceStatus?.overtimeAttendances?.length) {
        return { activeOvertimes: [], futureOvertimes: [] };
      }

      const today = format(new Date(), 'yyyy-MM-dd');

      const processAttendances = attendanceStatus.overtimeAttendances.map(
        (ot) => {
          const date =
            ot.overtimeRequest.date instanceof Date
              ? ot.overtimeRequest.date
              : new Date(ot.overtimeRequest.date);

          return {
            ...ot,
            overtimeRequest: {
              ...ot.overtimeRequest,
              date,
            },
          };
        },
      );

      return {
        activeOvertimes: processAttendances.filter(
          (ot) => format(ot.overtimeRequest.date, 'yyyy-MM-dd') === today,
        ),
        futureOvertimes: processAttendances.filter(
          (ot) => format(ot.overtimeRequest.date, 'yyyy-MM-dd') > today,
        ),
      };
    }, [attendanceStatus?.overtimeAttendances]);

    const renderTodayOvertime = useCallback(
      (overtime: OvertimeAttendanceInfo) => (
        <div
          key={overtime.overtimeRequest.id}
          className="mt-4 p-4 bg-yellow-50 rounded-lg"
        >
          <h4 className="text-md font-semibold mb-2 flex items-center">
            <AlertCircle className="mr-2" size={18} />
            {attendanceStatus?.isDayOff
              ? 'การทำงานล่วงเวลาในวันหยุด'
              : 'การทำงานล่วงเวลา'}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-600">เวลาที่อนุมัติ (OT)</p>
              <p className="font-medium">
                {overtime.overtimeRequest.startTime} -{' '}
                {overtime.overtimeRequest.endTime}
              </p>
            </div>
            <div>
              <p className="text-gray-600">เวลาทำงานจริง (OT)</p>
              <p className="font-medium">
                {overtime.attendanceTime?.checkInTime || 'ยังไม่ได้ลงเวลา'} -{' '}
                {overtime.attendanceTime?.checkOutTime || 'ยังไม่สิ้นสุด'}
              </p>
              {overtime.periodStatus.isComplete && (
                <div className="mt-2 text-sm text-green-600">
                  ✓ การทำงานล่วงเวลา OT เสร็จสิ้น
                </div>
              )}
            </div>
          </div>
          {overtime.periodStatus.isActive && (
            <div className="mt-2 text-sm text-blue-600">
              * กำลังอยู่ในช่วงเวลาทำงานล่วงเวลา OT
            </div>
          )}
        </div>
      ),
      [attendanceStatus?.isDayOff],
    );

    const renderTodayInfo = useMemo(() => {
      if (!attendanceStatus || !effectiveShift) return null;

      const today = new Date();

      return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <Calendar className="mr-2" /> ข้อมูลการทำงานวันนี้
            </h3>
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

          {attendanceStatus?.isDayOff && (
            <div className="mb-4 p-4 bg-blue-50 rounded-lg">
              {attendanceStatus.holidayInfo ? (
                <>
                  <h4 className="text-md font-semibold mb-2 text-blue-700">
                    วันหยุดนักขัตฤกษ์
                  </h4>
                  <p className="text-blue-600">
                    {attendanceStatus.holidayInfo.localName}
                  </p>
                  {attendanceStatus.approvedOvertime && (
                    <p className="text-gray-600 mt-2">
                      *มีการอนุมัติทำงานล่วงเวลาในวันหยุด
                    </p>
                  )}
                </>
              ) : (
                <>
                  <h4 className="text-md font-semibold mb-2 text-blue-700">
                    วันหยุดประจำสัปดาห์
                  </h4>
                  {attendanceStatus.approvedOvertime && (
                    <p className="text-gray-600 mt-2">
                      *มีการอนุมัติทำงานล่วงเวลาในวันหยุด
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!attendanceStatus?.isDayOff && effectiveShift && (
            <div className="mb-4">
              <p className="text-gray-800">
                <span className="font-medium">{effectiveShift.name}</span>
              </p>
              <p className="text-gray-600 flex items-center mt-1">
                <Clock className="mr-2" size={16} />
                {effectiveShift.startTime} - {effectiveShift.endTime}
              </p>
              {attendanceStatus?.shiftAdjustment && (
                <p className="text-blue-600 mt-2 text-sm">
                  * เวลาทำงานได้รับการปรับเปลี่ยนสำหรับวันนี้
                </p>
              )}
            </div>
          )}

          {/* Regular Period Times */}
          {attendanceStatus.currentPeriod?.type === 'regular' && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-600">เวลาเข้างาน</p>
                <p className="font-medium">
                  {attendanceStatus.latestAttendance?.regularCheckInTime ||
                    'ยังไม่ได้ลงเวลา'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">เวลาออกงาน</p>
                <p className="font-medium">
                  {attendanceStatus.latestAttendance?.regularCheckOutTime ||
                    'ยังไม่ได้ลงเวลา'}
                </p>
              </div>
            </div>
          )}

          {/* Location Status */}
          {!locationReady && (
            <div className="mt-2 p-3 bg-yellow-50 rounded-lg">
              <p className="text-yellow-700 flex items-center">
                <AlertCircle className="mr-2" size={16} />
                กำลังตรวจสอบตำแหน่งของคุณ...
              </p>
            </div>
          )}
        </div>
      );
    }, [attendanceStatus, effectiveShift, locationReady]);

    const renderFutureInfo = useMemo(() => {
      const futureShiftAdjustments =
        attendanceStatus?.futureShifts?.filter(
          (adjustment) => !isToday(parseISO(adjustment.date)),
        ) ?? [];

      const futureOts = attendanceStatus?.futureOvertimes ?? [];

      if (futureShiftAdjustments.length === 0 && futureOts.length === 0) {
        return null;
      }

      return (
        <div className="space-y-4">
          {futureShiftAdjustments.map((adjustment, index) => (
            <div
              key={`shift-${adjustment.date}-${index}`}
              className="bg-white p-6 rounded-lg shadow-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center">
                  <Briefcase className="mr-2" /> การปรับเปลี่ยนกะการทำงาน
                </h3>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-600">
                    {format(parseISO(adjustment.date), 'd', { locale: th })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {format(parseISO(adjustment.date), 'MMM', { locale: th })}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-700 font-medium">
                    กะ: {adjustment.shift?.name}
                  </p>
                  <p className="text-gray-600 flex items-center mt-1">
                    <Clock className="mr-2" size={16} />
                    {adjustment.shift?.startTime} - {adjustment.shift?.endTime}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    {format(parseISO(adjustment.date), 'EEEE', { locale: th })}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {futureOts.map((overtime, index) => (
            <div
              key={`overtime-${overtime.id || index}`}
              className="bg-white p-6 rounded-lg shadow-md"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center">
                  <AlertCircle className="mr-2" /> แจ้งเตือน OT ล่วงหน้า
                </h3>
                <div className="text-right">
                  <p className="text-2xl font-bold text-red-600">
                    {format(overtime.date, 'd', { locale: th })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {format(overtime.date, 'MMM', { locale: th })}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 flex items-center">
                    <Clock className="mr-2" size={16} />
                    {overtime.startTime} - {overtime.endTime}
                  </p>
                  <p className="text-gray-700 mt-2">
                    สาเหตุ: {overtime.reason}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    {format(overtime.date, 'EEEE', { locale: th })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }, [attendanceStatus?.futureShifts, attendanceStatus?.futureOvertimes]);

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

    if (!userData || !effectiveShift) {
      return (
        <div className="text-center p-4">
          <p className="text-red-600">ไม่สามารถโหลดข้อมูลได้</p>
          <p className="text-sm text-gray-500 mt-2">กรุณาลองใหม่อีกครั้ง</p>
        </div>
      );
    }

    return (
      <div className="pb-24">
        {/* User Info Card with Status */}
        <div className="bg-white p-6 rounded-lg shadow-md text-center mb-4">
          <p className="text-2xl font-bold">{userData.name}</p>
          <p className="text-xl text-gray-600">
            รหัสพนักงาน: {userData.employeeId}
          </p>
          <p className="text-gray-600">แผนก: {userData.departmentName}</p>

          {/* Status Message */}
          <div
            className="mt-4 inline-flex items-center px-3 py-1 rounded-full text-sm"
            style={{
              backgroundColor: `rgba(${color === 'red' ? '239, 68, 68' : color === 'green' ? '34, 197, 94' : '59, 130, 246'}, 0.1)`,
            }}
          >
            <div
              className={`w-2 h-2 rounded-full bg-${color === 'red' ? 'red-500' : color === 'green' ? 'green-500' : 'blue-500'} mr-2`}
            ></div>
            <span
              className={`text-${color === 'red' ? 'red-700' : color === 'green' ? 'green-700' : 'blue-700'}`}
            >
              {message}
            </span>
          </div>
        </div>

        {/* Regular Period Info */}
        {renderTodayInfo}

        {/* Active Overtime Info */}
        {attendanceStatus?.currentPeriod?.type === 'overtime'
          ? // Show current overtime if in overtime period
            renderTodayOvertime(activeOvertimes[0])
          : // Show upcoming overtime if in regular period
            activeOvertimes.map((overtime) => (
              <OvertimePeriodInfo
                key={overtime.overtimeRequest.id}
                overtime={overtime}
                isDayOff={attendanceStatus?.isDayOff ?? false}
              />
            ))}

        {/* Future Info */}
        {renderFutureInfo}
      </div>
    );
  },
);

UserShiftInfo.displayName = 'UserShiftInfo';

export default UserShiftInfo;

import React, { useCallback, useMemo } from 'react';
import {
  AttendanceStatusInfo,
  ShiftData,
  ApprovedOvertime,
} from '../types/attendance';
import { UserData } from '../types/user';
import { format, isToday, isValid, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Clock, Briefcase, AlertCircle } from 'lucide-react';

interface UserShiftInfoProps {
  userData: UserData;
  attendanceStatus: AttendanceStatusInfo | null;
  effectiveShift: ShiftData | null;
}

const UserShiftInfo: React.FC<UserShiftInfoProps> = React.memo(
  ({ userData, attendanceStatus, effectiveShift }) => {
    const latestAttendance = attendanceStatus?.latestAttendance;

    const getStatusMessage = useMemo(() => {
      if (attendanceStatus?.isDayOff) {
        return { message: 'วันหยุด', color: 'blue' };
      }
      if (attendanceStatus?.pendingLeaveRequest) {
        return { message: 'รออนุมัติการลา', color: 'orange' };
      }

      if (!latestAttendance) {
        return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
      }

      const attendanceDate = parseISO(latestAttendance.date);

      if (!isToday(attendanceDate)) {
        return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
      }

      if (latestAttendance.checkOutTime) {
        return { message: 'ทำงานเสร็จแล้ว', color: 'green' };
      }

      if (latestAttendance.checkInTime) {
        return { message: 'อยู่ระหว่างเวลาทำงาน', color: 'orange' };
      }

      return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
    }, [
      attendanceStatus?.isDayOff,
      attendanceStatus?.pendingLeaveRequest,
      latestAttendance,
    ]);

    const isOvertimeForToday = useCallback((overtime: ApprovedOvertime) => {
      if (!overtime.date) return false;
      const overtimeDate = parseISO(overtime.date.toString());
      return isValid(overtimeDate) && isToday(overtimeDate);
    }, []);

    const renderTodayInfo = useMemo(() => {
      const todayOvertime =
        attendanceStatus?.approvedOvertime &&
        isOvertimeForToday(attendanceStatus.approvedOvertime)
          ? attendanceStatus.approvedOvertime
          : null;

      return (
        <div className="bg-white p-6 rounded-lg shadow-md mb-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Calendar className="mr-2" /> ข้อมูลการทำงานวันนี้
          </h3>
          {attendanceStatus?.isDayOff ? (
            <p className="text-gray-600 mb-4">วันหยุด (มีการทำงานล่วงเวลา)</p>
          ) : (
            effectiveShift && (
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
            )
          )}
          {latestAttendance && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-600">เวลาเข้างาน</p>
                <p className="font-medium">
                  {latestAttendance.checkInTime || 'ยังไม่ได้ลงเวลา'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">เวลาออกงาน</p>
                <p className="font-medium">
                  {latestAttendance.checkOutTime || 'ยังไม่ได้ลงเวลา'}
                </p>
              </div>
            </div>
          )}
          {todayOvertime && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <h4 className="text-md font-semibold mb-2 flex items-center">
                <AlertCircle className="mr-2" size={18} />{' '}
                การทำงานล่วงเวลาที่ได้รับอนุมัติ
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">เวลาที่อนุมัติ</p>
                  <p className="font-medium">
                    {todayOvertime.startTime} - {todayOvertime.endTime}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">เวลาทำงานจริง</p>
                  <p className="font-medium">
                    {latestAttendance?.checkInTime || 'ยังไม่ได้ลงเวลา'} -{' '}
                    {latestAttendance?.checkOutTime || 'ยังไม่สิ้นสุด'}
                  </p>
                </div>
              </div>
              {latestAttendance &&
                latestAttendance.checkInTime !== todayOvertime.startTime && (
                  <p className="text-orange-600 mt-2">
                    * เวลาเข้างานไม่ตรงกับเวลาที่ได้รับอนุมัติ
                  </p>
                )}
              <p className="text-gray-600 mt-2">
                เวลาที่อนุมัติ:{' '}
                <span className="font-medium">
                  {todayOvertime.approvedAt
                    ? format(
                        new Date(todayOvertime.approvedAt),
                        'dd/MM/yyyy HH:mm',
                        {
                          locale: th,
                        },
                      )
                    : 'N/A'}
                </span>
              </p>
            </div>
          )}
        </div>
      );
    }, [attendanceStatus, effectiveShift, isOvertimeForToday]);

    const renderFutureInfo = useMemo(() => {
      const futureShiftAdjustments =
        attendanceStatus?.futureShifts.filter(
          (adjustment) => !isToday(parseISO(adjustment.date)),
        ) ?? [];

      if (
        futureShiftAdjustments.length === 0 &&
        (attendanceStatus?.futureOvertimes.length ?? 0) === 0
      ) {
        return null;
      }

      return (
        <div className="space-y-4">
          {futureShiftAdjustments.map((adjustment, index) => (
            <div
              key={`shift-${index}`}
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
          {attendanceStatus?.futureOvertimes.map((overtime, index) => (
            <div
              key={`overtime-${index}`}
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

    const { message, color } = getStatusMessage;

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-2xl font-bold">{userData.name}</p>
          <p className="text-xl text-gray-600">
            รหัสพนักงาน: {userData.employeeId}
          </p>
          <p className="text-gray-600">แผนก: {userData.departmentName}</p>
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
        {renderTodayInfo}
        {renderFutureInfo}
      </div>
    );
  },
);

UserShiftInfo.displayName = 'UserShiftInfo';

export default UserShiftInfo;

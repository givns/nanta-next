import React, { useCallback, useMemo } from 'react';
import {
  AttendanceStatusInfo,
  ShiftData,
  ApprovedOvertime,
  OvertimeRequestStatus,
  OvertimeAttendanceInfo,
} from '../../types/attendance';
import { UserData } from '../../types/user';
import {
  addHours,
  format,
  isAfter,
  isBefore,
  isToday,
  isValid,
  parseISO,
} from 'date-fns';
import { th } from 'date-fns/locale';
import { Calendar, Clock, Briefcase, AlertCircle } from 'lucide-react';

interface UserShiftInfoProps {
  userData: UserData;
  attendanceStatus: AttendanceStatusInfo | null;
  effectiveShift: ShiftData | null;
  isLoading: boolean;
}

interface OvertimeDisplayInfo {
  overtimeRequest: ApprovedOvertime;
  actualStartTime: string | null;
  actualEndTime: string | null;
  status: 'pending' | 'inProgress' | 'completed';
}

const UserShiftInfo = React.memo(
  ({
    userData,
    attendanceStatus,
    effectiveShift,
    isLoading,
  }: UserShiftInfoProps) => {
    // Separate active and future overtimes
    const { activeOvertimes, futureOvertimes } = useMemo(() => {
      if (!attendanceStatus?.overtimeAttendances) {
        return { activeOvertimes: [], futureOvertimes: [] };
      }

      const now = new Date();
      const today = format(now, 'yyyy-MM-dd');

      return {
        activeOvertimes: attendanceStatus.overtimeAttendances.filter(
          (ot) =>
            format(new Date(ot.overtimeRequest.date), 'yyyy-MM-dd') === today,
        ),
        futureOvertimes: attendanceStatus.overtimeAttendances.filter(
          (ot) =>
            format(new Date(ot.overtimeRequest.date), 'yyyy-MM-dd') > today,
        ),
      };
    }, [attendanceStatus?.overtimeAttendances]);

    const overtimeDisplays = useMemo(() => {
      if (!attendanceStatus?.approvedOvertime) return [];

      return attendanceStatus.overtimeEntries.map((entry) => {
        const overtimeRequest = attendanceStatus.approvedOvertime!;
        const actualStart = entry.actualStartTime
          ? format(new Date(entry.actualStartTime), 'HH:mm')
          : null;
        const actualEnd = entry.actualEndTime
          ? format(new Date(entry.actualEndTime), 'HH:mm')
          : null;

        return {
          overtimeRequest,
          actualStartTime: actualStart,
          actualEndTime: actualEnd,
          status: !actualStart
            ? 'pending'
            : !actualEnd
              ? 'inProgress'
              : 'completed',
        };
      });
    }, [attendanceStatus]);

    const latestAttendance = attendanceStatus?.latestAttendance;

    // Move overtime calculation to its own useMemo
    const todayOvertime = useMemo(() => {
      if (!attendanceStatus?.approvedOvertime) return null;

      const overtime = attendanceStatus.approvedOvertime;
      const currentTime = new Date();
      const overtimeDate = parseISO(overtime.date.toString());

      if (!isValid(overtimeDate) || !isToday(overtimeDate)) {
        return null;
      }

      const overtimeStart = parseISO(
        `${format(currentTime, 'yyyy-MM-dd')}T${overtime.startTime}`,
      );
      const overtimeEnd = parseISO(
        `${format(currentTime, 'yyyy-MM-dd')}T${overtime.endTime}`,
      );

      if (
        isBefore(currentTime, overtimeEnd) ||
        (isBefore(currentTime, addHours(overtimeEnd, 1)) &&
          isAfter(currentTime, overtimeStart))
      ) {
        return overtime;
      }

      return null;
    }, [attendanceStatus?.approvedOvertime]);

    const getStatusMessage = useMemo(() => {
      if (!attendanceStatus) {
        return { message: 'ไม่พบข้อมูล', color: 'gray' };
      }

      if (attendanceStatus.isDayOff) {
        if (attendanceStatus.holidayInfo) {
          return { message: 'วันหยุดนักขัตฤกษ์', color: 'blue' };
        }
        return { message: 'วันหยุดประจำสัปดาห์', color: 'blue' };
      }

      if (attendanceStatus.pendingLeaveRequest) {
        return { message: 'รออนุมัติการลา', color: 'orange' };
      }

      if (!latestAttendance) {
        return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
      }

      const attendanceDate = parseISO(latestAttendance.date);

      if (!isToday(attendanceDate)) {
        return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
      }

      if (latestAttendance.regularCheckOutTime) {
        return { message: 'ทำงานเสร็จแล้ว', color: 'green' };
      }

      if (latestAttendance.regularCheckInTime) {
        return { message: 'อยู่ระหว่างเวลาทำงาน', color: 'orange' };
      }

      return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
    }, [attendanceStatus, latestAttendance]);

    // Update the renderTodayOvertime function
    const renderTodayOvertime = (overtime: OvertimeAttendanceInfo) => (
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
            <p className="text-gray-600">เวลาที่อนุมัติ</p>
            <p className="font-medium">
              {overtime.overtimeRequest.startTime} -{' '}
              {overtime.overtimeRequest.endTime}
            </p>
          </div>
          <div>
            <p className="text-gray-600">เวลาทำงานจริง</p>
            <p className="font-medium">
              {overtime.attendanceTime?.checkInTime || 'ยังไม่ได้ลงเวลา'} -{' '}
              {overtime.attendanceTime?.checkOutTime || 'ยังไม่สิ้นสุด'}
            </p>
          </div>
        </div>
        {overtime.periodStatus.isActive && (
          <div className="mt-2 text-sm text-blue-600">
            * กำลังอยู่ในช่วงเวลาทำงานล่วงเวลา
          </div>
        )}
      </div>
    );

    const renderUserInfo = useMemo(
      () => (
        <div className="bg-white p-6 rounded-lg shadow-md text-center mb-4">
          <p className="text-2xl font-bold">{userData.name}</p>
          <p className="text-xl text-gray-600">
            รหัสพนักงาน: {userData.employeeId}
          </p>
          <p className="text-gray-600">แผนก: {userData.departmentName}</p>
          <div
            className="mt-4 inline-flex items-center px-3 py-1 rounded-full text-sm"
            style={{
              backgroundColor: `rgba(${getStatusMessage.color === 'red' ? '239, 68, 68' : getStatusMessage.color === 'green' ? '34, 197, 94' : '59, 130, 246'}, 0.1)`,
            }}
          >
            <div
              className={`w-2 h-2 rounded-full bg-${getStatusMessage.color === 'red' ? 'red-500' : getStatusMessage.color === 'green' ? 'green-500' : 'blue-500'} mr-2`}
            ></div>
            <span
              className={`text-${getStatusMessage.color === 'red' ? 'red-700' : getStatusMessage.color === 'green' ? 'green-700' : 'blue-700'}`}
            >
              {getStatusMessage.message}
            </span>
          </div>
        </div>
      ),
      [userData, getStatusMessage],
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
                  {todayOvertime && (
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
                  {todayOvertime && (
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

          {latestAttendance && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-600">เวลาเข้างาน</p>
                <p className="font-medium">
                  {latestAttendance.regularCheckInTime || 'ยังไม่ได้ลงเวลา'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">เวลาออกงาน</p>
                <p className="font-medium">
                  {latestAttendance.regularCheckOutTime || 'ยังไม่ได้ลงเวลา'}
                </p>
              </div>
            </div>
          )}
        </div>
      );
    }, [
      attendanceStatus?.isDayOff,
      attendanceStatus?.holidayInfo,
      effectiveShift,
      latestAttendance,
      todayOvertime,
    ]);

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
        {' '}
        {/* Add bottom padding for fixed footer */}
        {/* User info card - always visible */}
        <div className="bg-white p-6 rounded-lg shadow-md text-center mb-4">
          {/* ... user info content ... */}
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
        {/* Today's info */}
        <div className="mb-4">{renderTodayInfo}</div>
        {/* Today's overtime */}
        {activeOvertimes.length > 0 && (
          <div className="space-y-4">
            {activeOvertimes.map(renderTodayOvertime)}
          </div>
        )}
        {/* Future info - if exists */}
        {renderFutureInfo && (
          <div className="space-y-4">{renderFutureInfo}</div>
        )}
      </div>
    );
  },
);

UserShiftInfo.displayName = 'UserShiftInfo';

export default UserShiftInfo;

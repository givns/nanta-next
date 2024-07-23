import React from 'react';
import { UserData, AttendanceStatus, ShiftData } from '../types/user';
import { formatTime } from '../utils/dateUtils';
import { getDeviceType } from '../utils/deviceUtils';
import moment from 'moment-timezone';
import 'moment/locale/th';
moment.locale('th');

interface UserShiftInfoProps {
  userData: UserData;
  attendanceStatus: AttendanceStatus;
  departmentName: string;
  isOutsideShift: () => boolean;
}

const UserShiftInfo: React.FC<UserShiftInfoProps> = ({
  userData,
  attendanceStatus,
  departmentName,
  isOutsideShift,
}) => {
  const formatOvertimeTime = (time: string) => time;

  const today = moment().tz('Asia/Bangkok').startOf('day');

  const todayShiftAdjustment = attendanceStatus.shiftAdjustment;

  const shift: ShiftData | null | undefined =
    todayShiftAdjustment?.requestedShift || userData.assignedShift;

  const futureShiftAdjustments =
    attendanceStatus.futureShiftAdjustments?.filter((adj) =>
      moment(adj.date).tz('Asia/Bangkok').startOf('day').isAfter(today),
    ) || [];

  const getStatusMessage = () => {
    if (
      !attendanceStatus.latestAttendance ||
      !moment(attendanceStatus.latestAttendance.date).isSame(today, 'day')
    ) {
      return 'ยังไม่มีการลงเวลาในวันนี้';
    }
    if (attendanceStatus.latestAttendance.checkOutTime) {
      return 'ทำงานเสร็จสิ้นแล้ว';
    }
    if (attendanceStatus.latestAttendance.checkInTime) {
      return 'ลงเวลาเข้างานแล้ว';
    }
    return 'ยังไม่มีการลงเวลาในวันนี้';
  };

  const isOvertimeForToday = (overtime: any) => {
    const overtimeDate = moment(overtime.date)
      .tz('Asia/Bangkok')
      .startOf('day');
    return overtimeDate.isSame(today);
  };

  const renderTodayInfo = () => (
    <div className="bg-gray-100 p-4 rounded-lg mb-4">
      <h2 className="text-lg font-semibold mb-2">
        สถานะวันนี้ ({today.format('DD/MM/YYYY')}):{' '}
        <span className="text-black-600">
          {attendanceStatus.isDayOff ? 'วันหยุด' : getStatusMessage()}
        </span>
      </h2>
      {attendanceStatus.isDayOff && attendanceStatus.potentialOvertime && (
        <div className="mt-2 text-yellow-600">
          <p>พบการทำงานนอกเวลาที่อาจยังไม่ได้รับอนุมัติ:</p>
          <p>
            {attendanceStatus.potentialOvertime.start} -{' '}
            {attendanceStatus.potentialOvertime.end}
          </p>
        </div>
      )}
      {attendanceStatus.latestAttendance &&
        moment(attendanceStatus.latestAttendance.date).isSame(today, 'day') && (
          <>
            {attendanceStatus.latestAttendance.checkInTime && (
              <p>
                เวลาเข้างาน:{' '}
                <span className="font-medium">
                  {formatTime(attendanceStatus.latestAttendance.checkInTime)}
                </span>
              </p>
            )}
            {attendanceStatus.latestAttendance.checkOutTime && (
              <p>
                เวลาออกงาน:{' '}
                <span className="font-medium">
                  {formatTime(attendanceStatus.latestAttendance.checkOutTime)}
                </span>
              </p>
            )}
            {attendanceStatus.latestAttendance.checkInDeviceSerial && (
              <p>
                วิธีการ:{' '}
                <span className="font-medium">
                  {getDeviceType(
                    attendanceStatus.latestAttendance.checkInDeviceSerial,
                  )}
                </span>
              </p>
            )}
          </>
        )}

      {shift && (
        <>
          <h3 className="text-md font-semibold mt-4 mb-1">
            กะการทำงานของคุณวันนี้:
          </h3>
          <p>
            <span className="font-medium">{shift.name}</span> ({shift.startTime}{' '}
            - {shift.endTime})
          </p>
          {todayShiftAdjustment && (
            <p className="text-blue-600 mt-1">
              * เวลาทำงานได้รับการปรับเปลี่ยนสำหรับวันนี้
            </p>
          )}
        </>
      )}

      {attendanceStatus.approvedOvertime &&
        isOvertimeForToday(attendanceStatus.approvedOvertime) && (
          <>
            <h3 className="text-md font-semibold mt-4 mb-1">
              รายละเอียดการทำงานล่วงเวลาที่ได้รับอนุมัติ:
            </h3>
            <p>
              เวลาเริ่ม:{' '}
              <span className="font-medium">
                {formatOvertimeTime(
                  attendanceStatus.approvedOvertime.startTime,
                )}
              </span>
            </p>
            <p>
              เวลาสิ้นสุด:{' '}
              <span className="font-medium">
                {formatOvertimeTime(attendanceStatus.approvedOvertime.endTime)}
              </span>
            </p>
            <p>
              เวลาที่อนุมัติ:{' '}
              <span className="font-medium">
                {moment(attendanceStatus.approvedOvertime.approvedAt)
                  .tz('Asia/Bangkok')
                  .format('YYYY-MM-DD HH:mm:ss')}
              </span>
            </p>
          </>
        )}

      {isOutsideShift() && !attendanceStatus.approvedOvertime && (
        <p className="text-red-500 mt-2">
          คุณกำลังลงเวลานอกช่วงเวลาทำงานของคุณ
        </p>
      )}
    </div>
  );

  const renderFutureInfo = () => {
    const futureOvertime =
      attendanceStatus.approvedOvertime &&
      !isOvertimeForToday(attendanceStatus.approvedOvertime)
        ? [attendanceStatus.approvedOvertime]
        : [];

    // Check for additional future overtime requests
    const additionalFutureOvertimes =
      attendanceStatus.futureApprovedOvertimes || [];

    // Combine all future overtimes
    const allFutureOvertimes = [
      ...futureOvertime,
      ...additionalFutureOvertimes,
    ];

    if (
      futureShiftAdjustments.length === 0 &&
      allFutureOvertimes.length === 0
    ) {
      return null;
    }

    return (
      <div className="bg-yellow-100 p-4 rounded-lg mt-4">
        <h3 className="text-md font-semibold mb-2">ข้อมูลการทำงานในอนาคต:</h3>
        {futureShiftAdjustments.map((adjustment, index) => (
          <div key={`shift-${index}`} className="mb-2">
            <p>วันที่: {moment(adjustment.date).format('LL')}</p>
            <p>
              เวลาทำงานใหม่: {adjustment.shift.name} (
              {adjustment.shift.startTime} - {adjustment.shift.endTime})
            </p>
          </div>
        ))}
        {allFutureOvertimes.map((overtime, index) => (
          <div key={`overtime-${index}`} className="mb-2">
            <p>วันที่: {moment(overtime.date).format('LL')}</p>
            <p>
              เวลาทำงานล่วงเวลา: {overtime.startTime} - {overtime.endTime}
            </p>
            <p>เหตุผล: {overtime.reason}</p>
            <p>สถานะ: {overtime.status}</p>
            {overtime.approvedAt && (
              <p>
                เวลาที่อนุมัติ:{' '}
                {moment(overtime.approvedAt)
                  .tz('Asia/Bangkok')
                  .format('YYYY-MM-DD HH:mm:ss')}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 mb-4">
        <p className="text-2xl font-bold">{userData.name}</p>
        <p className="text-xl">(รหัสพนักงาน: {userData.employeeId})</p>
        <p className="mb-4 text-gray-600">แผนก: {departmentName}</p>
      </div>

      <div className="flex-grow overflow-y-auto">
        {renderTodayInfo()}
        {renderFutureInfo()}
      </div>
    </div>
  );
};

export default UserShiftInfo;

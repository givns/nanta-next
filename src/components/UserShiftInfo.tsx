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
      return { message: 'ยังไม่มีการลงเวลาในวันนี้', color: 'red' };
    }
    if (attendanceStatus.latestAttendance.checkOutTime) {
      return { message: 'ทำงานเสร็จสิ้นแล้ว', color: 'green' };
    }
    if (attendanceStatus.latestAttendance.checkInTime) {
      return { message: 'ลงเวลาเข้างานแล้ว', color: 'orange' };
    }
    return { message: 'ยังไม่มีการลงเวลาในวันนี้', color: 'red' };
  };

  const isOvertimeForToday = (overtime: any) => {
    const overtimeDate = moment(overtime.date)
      .tz('Asia/Bangkok')
      .startOf('day');
    return overtimeDate.isSame(today);
  };

  const renderUserInfo = () => (
    <div className="bg-white p-4 rounded-lg mb-6 text-center">
      <p className="text-2xl font-bold">{userData.name}</p>
      <p className="text-xl">รหัสพนักงาน: {userData.employeeId}</p>
      <p className="text-gray-600">แผนก: {departmentName}</p>
    </div>
  );

  const renderTodayInfo = () => {
    const statusInfo = attendanceStatus.isDayOff
      ? { message: 'วันหยุด', color: 'blue' }
      : getStatusMessage();
    const shift =
      attendanceStatus.shiftAdjustment?.requestedShift ||
      userData.assignedShift;

    return (
      <div className="bg-white p-4 rounded-lg mb-6">
        <div className="flex items-center mb-2">
          <h2 className="text-lg font-semibold">
            สถานะวันนี้ ({today.format('DD/MM/YYYY')})
            <p>
              {' '}
              <div
                className={`w-4 h-4 rounded-full bg-${statusInfo.color}-500 mr-2`}
              ></div>
              <span className="text-black-600">{statusInfo.message}</span>
            </p>
          </h2>
        </div>
        {!attendanceStatus.isDayOff &&
          attendanceStatus.latestAttendance &&
          moment(attendanceStatus.latestAttendance.date).isSame(
            today,
            'day',
          ) && (
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
        {!attendanceStatus.isDayOff && shift && (
          <>
            <h3 className="text-md font-semibold mt-4 mb-1">
              กะการทำงานของคุณวันนี้:
            </h3>
            <p>
              <span className="font-medium">{shift.name}</span> (
              {shift.startTime} - {shift.endTime})
            </p>
          </>
        )}
        {attendanceStatus.isDayOff && attendanceStatus.potentialOvertime && (
          <div className="mt-2 text-yellow-600">
            <p>พบการทำงานนอกเวลาที่อาจยังไม่ได้รับอนุมัติ:</p>
            <p>
              {attendanceStatus.potentialOvertime.start} -{' '}
              {attendanceStatus.potentialOvertime.end}
            </p>
          </div>
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
                  {formatOvertimeTime(
                    attendanceStatus.approvedOvertime.endTime,
                  )}
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
  };

  const renderFutureInfo = () => {
    const futureOvertime =
      attendanceStatus.approvedOvertime &&
      !isOvertimeForToday(attendanceStatus.approvedOvertime)
        ? [attendanceStatus.approvedOvertime]
        : [];

    const additionalFutureOvertimes =
      attendanceStatus.futureApprovedOvertimes || [];

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
      <div className="space-y-3">
        {futureShiftAdjustments.map((adjustment, index) => (
          <div
            key={`shift-${index}`}
            className="bg-yellow-100 p-4 rounded-lg mb-4"
          >
            <div className="flex justify-between mb-2">
              <p>{moment(adjustment.date).format('DD/MM/YYYY')}</p>
              <p>เวลาทำงาน</p>
            </div>
            <p>
              {adjustment.shift.name} ({adjustment.shift.startTime} -{' '}
              {adjustment.shift.endTime})
            </p>
          </div>
        ))}
        {allFutureOvertimes.map((overtime, index) => (
          <div
            key={`overtime-${index}`}
            className="bg-yellow-100 p-4 rounded-lg mb-4"
          >
            <div className="flex justify-between mb-2">
              <p>{moment(overtime.date).format('DD/MM/YYYY')}</p>
              <p>ทำงานล่วงเวลา</p>
            </div>
            <p>
              เวลา: {overtime.startTime} - {overtime.endTime}
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
      <div className="flex-grow overflow-y-auto space-y-6">
        {renderUserInfo()}
        {renderTodayInfo()}
        {renderFutureInfo()}
      </div>
  );
};

export default UserShiftInfo;

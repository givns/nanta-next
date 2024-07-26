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
  isOutsideShift: boolean;
}

const UserShiftInfo: React.FC<UserShiftInfoProps> = ({
  userData,
  attendanceStatus,
  departmentName,
  isOutsideShift,
}) => {
  const today = moment().tz('Asia/Bangkok').startOf('day');
  // Find today's shift adjustment if it exists in futureShiftAdjustments
  const todayShiftAdjustment = attendanceStatus.futureShiftAdjustments.find(
    (adjustment) => moment(adjustment.date).isSame(today, 'day'),
  );

  const getStatusMessage = () => {
    console.log('isDayOff:', attendanceStatus.isDayOff);
    console.log('latestAttendance:', attendanceStatus.latestAttendance);
    console.log('today:', today.format('YYYY-MM-DD'));

    if (attendanceStatus.isDayOff) {
      console.log('Condition: Day Off');
      return { message: 'วันหยุด', color: 'blue' };
    }

    if (!attendanceStatus.latestAttendance) {
      console.log('Condition: No attendance');
      return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
    }

    const attendanceDate = moment(
      attendanceStatus.latestAttendance.date,
    ).format('YYYY-MM-DD');
    console.log('Attendance date:', attendanceDate);

    if (attendanceDate !== today.format('YYYY-MM-DD')) {
      console.log('Condition: Attendance not for today');
      return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
    }

    if (attendanceStatus.latestAttendance.checkOutTime) {
      console.log('Condition: Checked out');
      return { message: 'ทำงานเสร็จแล้ว', color: 'green' };
    }

    if (attendanceStatus.latestAttendance.checkInTime) {
      console.log('Condition: Checked in');
      return { message: 'ลงเวลาเข้างานแล้ว', color: 'orange' };
    }

    console.log('Condition: Default - No attendance');
    return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
  };

  const renderTodayInfo = () => {
    const { message, color } = getStatusMessage();
    const todayShiftAdjustment =
      attendanceStatus.shiftAdjustment &&
      moment(attendanceStatus.shiftAdjustment.date).isSame(
        moment().startOf('day'),
        'day',
      )
        ? attendanceStatus.shiftAdjustment
        : null;
    const effectiveShift =
      todayShiftAdjustment?.requestedShift || userData.assignedShift;

    return (
      <div className="bg-white p-4 rounded-box mb-4">
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
        {!attendanceStatus.isDayOff && effectiveShift && (
          <>
            <h3 className="text-md font-semibold mt-4 mb-1">
              กะการทำงานของคุณวันนี้:
            </h3>
            <p>
              <span className="font-medium">{effectiveShift.name}</span> (
              {effectiveShift.startTime} - {effectiveShift.endTime})
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
                  {formatTime(attendanceStatus.approvedOvertime.startTime)}
                </span>
              </p>
              <p>
                เวลาสิ้นสุด:{' '}
                <span className="font-medium">
                  {formatTime(attendanceStatus.approvedOvertime.endTime)}
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
        {attendanceStatus.isDayOff && attendanceStatus.potentialOvertime && (
          <div className="mt-2 text-yellow-600">
            <p>พบการทำงานนอกเวลาที่อาจยังไม่ได้รับอนุมัติ:</p>
            <p>
              {attendanceStatus.potentialOvertime.start} -{' '}
              {attendanceStatus.potentialOvertime.end}
            </p>
          </div>
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

    const futureShiftAdjustments =
      attendanceStatus.futureShiftAdjustments.filter(
        (adjustment) => !moment(adjustment.date).isSame(today, 'day'),
      );

    if (
      futureShiftAdjustments.length === 0 &&
      allFutureOvertimes.length === 0
    ) {
      return null;
    }

    return (
      <>
        {futureShiftAdjustments.map((adjustment, index) => (
          <div
            key={`shift-${index}`}
            className="bg-yellow-300 p-4 rounded-box mb-4"
          >
            <div className="flex font-semibold justify-between">
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
            className="bg-yellow-300 p-4 rounded-box mb-4"
          >
            <div className="flex font-semibold justify-between">
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
      </>
    );
  };

  const isOvertimeForToday = (overtime: any) => {
    const overtimeDate = moment(overtime.date)
      .tz('Asia/Bangkok')
      .startOf('day');
    return overtimeDate.isSame(today);
  };
  const { message, color } = getStatusMessage();

  return (
    <div className="flex flex-col">
      <div className="bg-white p-4 rounded-box mb-4 text-center">
        <p className="text-2xl font-bold">{userData.name}</p>
        <p className="text-xl">รหัสพนักงาน: {userData.employeeId}</p>
        <p className="text-gray-600">แผนก: {departmentName}</p>
        <div className={`w-3 h-3 rounded-full bg-${color}-500 mr-2`}></div>
        <span className="text-gray-600">{message}</span>
      </div>

      {renderTodayInfo()}
      {renderFutureInfo()}
    </div>
  );
};

export default UserShiftInfo;

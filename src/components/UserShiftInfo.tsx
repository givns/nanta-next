import React from 'react';
import { UserData, AttendanceStatus, ApprovedOvertime } from '../types/user';
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

interface StatusMessage {
  message: string;
  color: string;
}

const UserShiftInfo: React.FC<UserShiftInfoProps> = ({
  userData,
  attendanceStatus,
  departmentName,
  isOutsideShift,
}) => {
  const today = moment().tz('Asia/Bangkok').startOf('day');

  const getStatusMessage = (): StatusMessage => {
    if (attendanceStatus.isDayOff) {
      return { message: 'วันหยุด', color: 'blue' };
    }

    const latestAttendance = attendanceStatus.latestAttendance;
    if (
      !latestAttendance ||
      !moment(latestAttendance.date).isSame(today, 'day')
    ) {
      return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
    }

    if (latestAttendance.checkOutTime) {
      return { message: 'ทำงานเสร็จแล้ว', color: 'green' };
    }

    if (latestAttendance.checkInTime) {
      return { message: 'ลงเวลาเข้างานแล้ว', color: 'orange' };
    }

    return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
  };

  const renderTodayInfo = () => {
    const todayShiftAdjustment =
      attendanceStatus.shiftAdjustment &&
      moment(attendanceStatus.shiftAdjustment.date).isSame(today, 'day')
        ? attendanceStatus.shiftAdjustment
        : null;
    const effectiveShift =
      todayShiftAdjustment?.requestedShift || userData.assignedShift;

    if (
      attendanceStatus.isDayOff &&
      !attendanceStatus.latestAttendance &&
      !effectiveShift
    ) {
      return null;
    }

    return (
      <div className="bg-white p-4 rounded-lg mb-4">
        {renderAttendanceInfo()}
        {renderShiftInfo(effectiveShift, todayShiftAdjustment)}
        {renderOvertimeInfo()}
      </div>
    );
  };

  const renderAttendanceInfo = () => {
    const latestAttendance = attendanceStatus.latestAttendance;
    if (
      !latestAttendance ||
      !moment(latestAttendance.date).isSame(today, 'day')
    ) {
      return null;
    }

    return (
      <>
        {latestAttendance.checkInTime && (
          <p className="text-gray-800">
            เวลาเข้างาน:{' '}
            <span className="font-medium">
              {formatTime(latestAttendance.checkInTime)}
            </span>
          </p>
        )}
        {latestAttendance.checkOutTime && (
          <p className="text-gray-800">
            เวลาออกงาน:{' '}
            <span className="font-medium">
              {formatTime(latestAttendance.checkOutTime)}
            </span>
          </p>
        )}
        {latestAttendance.checkInDeviceSerial && (
          <p className="text-gray-800">
            วิธีการ:{' '}
            <span className="font-medium">
              {getDeviceType(latestAttendance.checkInDeviceSerial)}
            </span>
          </p>
        )}
      </>
    );
  };

  const renderShiftInfo = (effectiveShift: any, todayShiftAdjustment: any) => {
    if (!effectiveShift) return null;

    return (
      <>
        <h3 className="text-md font-semibold mt-4 mb-1">
          กะการทำงานของคุณวันนี้:
        </h3>
        <p className="text-gray-800">
          <span className="font-medium">{effectiveShift.name}</span> (
          {effectiveShift.startTime} - {effectiveShift.endTime})
        </p>
        {todayShiftAdjustment && (
          <p className="text-blue-600 mt-1">
            * เวลาทำงานได้รับการปรับเปลี่ยนสำหรับวันนี้
          </p>
        )}
      </>
    );
  };

  const renderOvertimeInfo = () => {
    const { approvedOvertime, potentialOvertime, isDayOff } = attendanceStatus;

    if (approvedOvertime && isOvertimeForToday(approvedOvertime)) {
      return (
        <div className="mt-4">
          <h3 className="text-md font-semibold mb-1">
            รายละเอียดการทำงานล่วงเวลาที่ได้รับอนุมัติ:
          </h3>
          <p className="text-gray-800">
            เวลาเริ่ม:{' '}
            <span className="font-medium">
              {formatTime(approvedOvertime.startTime)}
            </span>
          </p>
          <p className="text-gray-800">
            เวลาสิ้นสุด:{' '}
            <span className="font-medium">
              {formatTime(approvedOvertime.endTime)}
            </span>
          </p>
          <p className="text-gray-800">
            เวลาที่อนุมัติ:{' '}
            <span className="font-medium">
              {moment(approvedOvertime.approvedAt)
                .tz('Asia/Bangkok')
                .format('YYYY-MM-DD HH:mm:ss')}
            </span>
          </p>
        </div>
      );
    }

    if (isDayOff && potentialOvertime) {
      return (
        <div className="mt-4 text-yellow-600">
          <p>พบการทำงานนอกเวลาที่อาจยังไม่ได้รับอนุมัติ:</p>
          <p className="text-gray-800">
            {potentialOvertime.start} - {potentialOvertime.end}
          </p>
        </div>
      );
    }

    return null;
  };

  const renderFutureInfo = () => {
    const futureOvertimes = [
      ...(attendanceStatus.approvedOvertime &&
      !isOvertimeForToday(attendanceStatus.approvedOvertime)
        ? [attendanceStatus.approvedOvertime]
        : []),
      ...(attendanceStatus.futureApprovedOvertimes || []),
    ];

    const futureShiftAdjustments =
      attendanceStatus.futureShiftAdjustments.filter(
        (adjustment) => !moment(adjustment.date).isSame(today, 'day'),
      );

    if (futureShiftAdjustments.length === 0 && futureOvertimes.length === 0) {
      return null;
    }

    return (
      <>
        {futureShiftAdjustments.map((adjustment, index) =>
          renderFutureShiftAdjustment(adjustment, index),
        )}
        {futureOvertimes.map((overtime, index) =>
          renderFutureOvertime(overtime, index),
        )}
      </>
    );
  };

  const renderFutureShiftAdjustment = (adjustment: any, index: number) => (
    <div key={`shift-${index}`} className="bg-yellow-300 p-4 rounded-box mb-4">
      <div className="flex font-semibold justify-between">
        <p>{moment(adjustment.date).format('DD/MM/YYYY')}</p>
        <p>เวลาทำงาน</p>
      </div>
      <p>
        {adjustment.shift.name} ({adjustment.shift.startTime} -{' '}
        {adjustment.shift.endTime})
      </p>
    </div>
  );

  const renderFutureOvertime = (overtime: ApprovedOvertime, index: number) => (
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
  );

  const isOvertimeForToday = (overtime: ApprovedOvertime) => {
    return moment(overtime.date)
      .tz('Asia/Bangkok')
      .startOf('day')
      .isSame(today);
  };

  const { message, color } = getStatusMessage();

  return (
    <div className="flex flex-col">
      <div className="bg-white p-4 rounded-box mb-4 text-center">
        <p className="text-2xl font-bold">{userData.name}</p>
        <p className="text-xl">รหัสพนักงาน: {userData.employeeId}</p>
        <p className="text-gray-600">แผนก: {departmentName}</p>
        <div className="flex flex-col items-center">
          <div className="flex items-center mt-2">
            <div className={`w-3 h-3 rounded-full bg-${color}-500 mr-2`}></div>
            <span className="text-gray-600">{message}</span>
          </div>
        </div>
      </div>
      {renderTodayInfo()}
      {renderFutureInfo()}
    </div>
  );
};

export default UserShiftInfo;

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
  const formatOvertimeTime = (time: string) => {
    // Assuming the time is in 'HH:mm' format
    return time;
  };

  const today = moment().tz('Asia/Bangkok').startOf('day');

  const todayShiftAdjustment = attendanceStatus.shiftAdjustment;

  const shift: ShiftData | null | undefined =
    todayShiftAdjustment?.requestedShift || userData.assignedShift;

  const futureShiftAdjustments =
    attendanceStatus.futureShiftAdjustments?.filter((adj) =>
      moment(adj.date).tz('Asia/Bangkok').startOf('day').isAfter(today),
    ) || [];

  const renderFutureShiftAdjustments = () => {
    if (futureShiftAdjustments.length === 0) {
      return null;
    }
    return (
      <div className="bg-yellow-100 p-4 rounded-lg mt-4">
        <h3 className="text-md font-semibold mb-2">
          แจ้งเตือนการปรับเวลาทำงาน:
        </h3>
        {futureShiftAdjustments.map((adjustment, index) => (
          <div key={index} className="mb-2">
            <p>วันที่: {moment(adjustment.date).format('LL')}</p>
            <p>
              เวลาทำงานใหม่: {adjustment.shift.name} (
              {adjustment.shift.startTime} - {adjustment.shift.endTime})
            </p>
          </div>
        ))}
      </div>
    );
  };

  const getStatusMessage = () => {
    if (!attendanceStatus.latestAttendance) {
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

  const getTitle = () => {
    if (attendanceStatus.approvedOvertime) {
      return 'ทำงานล่วงเวลา';
    }
  };

  const isOvertimeForToday = (overtime: any) => {
    const overtimeDate = moment(overtime.date)
      .tz('Asia/Bangkok')
      .startOf('day');
    return overtimeDate.isSame(today);
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <p className="text-2xl font-bold">{userData.name}</p>
      <p className="text-xl">(รหัสพนักงาน: {userData.employeeId})</p>
      <p className="mb-4 text-gray-600">แผนก: {departmentName}</p>

      {getTitle() && (
        <p className="text-blue-600 font-semibold mb-2">{getTitle()}</p>
      )}

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="text-lg font-semibold mb-2">
          สถานะปัจจุบัน:{' '}
          <span className="text-black-600">{getStatusMessage()}</span>
        </h2>
        {attendanceStatus.latestAttendance && (
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

        {attendanceStatus.approvedOvertime &&
        isOvertimeForToday(attendanceStatus.approvedOvertime) ? (
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
        ) : shift ? (
          <>
            <h3 className="text-md font-semibold mt-4 mb-1">
              กะการทำงานของคุณวันนี้:
            </h3>
            <p>
              <span className="font-medium">{shift.name}</span> (
              {shift.startTime} - {shift.endTime})
            </p>
            {todayShiftAdjustment && (
              <p className="text-blue-600 mt-1">
                * เวลาทำงานได้รับการปรับเปลี่ยนสำหรับวันนี้
              </p>
            )}
          </>
        ) : (
          <p className="text-red-600 mt-4">ไม่พบข้อมูลกะการทำงาน</p>
        )}

        {isOutsideShift() && !attendanceStatus.approvedOvertime && (
          <p className="text-red-500 mt-2">
            คุณกำลังลงเวลานอกช่วงเวลาทำงานของคุณ
          </p>
        )}
      </div>

      {renderFutureShiftAdjustments()}
    </div>
  );
};

export default UserShiftInfo;

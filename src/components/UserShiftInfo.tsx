import React from 'react';
import { UserData, AttendanceStatus, ShiftData } from '../types/user';
import { formatTime } from '../utils/dateUtils';
import { getDeviceType } from '../utils/deviceUtils';

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
  const shift: ShiftData | null | undefined =
    attendanceStatus.shiftAdjustment?.requestedShift || userData.assignedShift;

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
    return attendanceStatus.shiftAdjustment ? 'กะการทำงานถูกปรับเปลี่ยน' : '';
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
          <span className="text-green-600">{getStatusMessage()}</span>
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

        {attendanceStatus.approvedOvertime ? (
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
            {attendanceStatus.shiftAdjustment && (
              <p className="text-blue-600 mt-1">
                * กะการทำงานนี้ได้รับการปรับเปลี่ยนสำหรับวันนี้
              </p>
            )}
          </>
        ) : null}

        {isOutsideShift() && !attendanceStatus.approvedOvertime && shift && (
          <p className="text-red-500 mt-2">
            การลงเวลาของคุณอยู่นอกเวลากะที่กำหนด กะของคุณเริ่มเวลา{' '}
            {shift.startTime}
          </p>
        )}
      </div>
    </div>
  );
};

export default UserShiftInfo;

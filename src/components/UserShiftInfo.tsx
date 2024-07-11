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
    if (attendanceStatus.latestAttendance?.checkOutTime) {
      return 'วันทำงานเสร็จสิ้น';
    }
    if (attendanceStatus.isCheckingIn) {
      return 'ระบบบันทึกเวลาเข้างาน';
    }
    return 'ระบบบันทึกเวลาออกงาน';
  };

  const getTitle = () => {
    if (attendanceStatus.approvedOvertime) {
      return 'ระบบบันทึกเวลาทำงานล่วงเวลา';
    }
    return 'ระบบบันทึกเวลา';
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">{getTitle()}</h1>
      <p>
        {userData.name} (ID: {userData.employeeId})
      </p>
      <p className="mb-4">แผนก: {departmentName}</p>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="text-lg font-semibold mb-2">
          สถานะปัจจุบัน: {getStatusMessage()}
        </h2>
        {attendanceStatus.latestAttendance && (
          <>
            <p>
              เวลาเข้างาน:{' '}
              {formatTime(attendanceStatus.latestAttendance.checkInTime)}
            </p>
            {attendanceStatus.latestAttendance.checkOutTime && (
              <p>
                เวลาออกงาน:{' '}
                {formatTime(attendanceStatus.latestAttendance.checkOutTime)}
              </p>
            )}
            <p>
              วิธีการ:{' '}
              {getDeviceType(
                attendanceStatus.latestAttendance.checkInDeviceSerial,
              )}
            </p>
          </>
        )}

        {attendanceStatus.approvedOvertime ? (
          <>
            <h3 className="text-md font-semibold mt-4 mb-1">
              รายละเอียดการทำงานล่วงเวลาที่ได้รับอนุมัติ:
            </h3>
            <p>
              เวลาเริ่ม: {attendanceStatus.approvedOvertime.startTime}
              เวลาสิ้นสุด: {attendanceStatus.approvedOvertime.endTime}
            </p>
          </>
        ) : shift ? (
          <>
            <h3 className="text-md font-semibold mt-4 mb-1">
              กะการทำงานของคุณวันนี้:
            </h3>
            <p>
              {shift.name} ({shift.startTime} - {shift.endTime})
            </p>
            {attendanceStatus.shiftAdjustment && (
              <p className="text-blue-600">* มีการปรับเปลี่ยนกะสำหรับวันนี้</p>
            )}
          </>
        ) : null}

        {isOutsideShift() && !attendanceStatus.approvedOvertime && (
          <p className="text-red-500 mt-2">
            การลงเวลาของคุณอยู่นอกเวลากะที่กำหนด กะของคุณเริ่มเวลา{' '}
            {shift?.startTime}
            การลงเวลาจะถูกดำเนินการพร้อมคำขอปรับเปลี่ยนกะ
          </p>
        )}
      </div>
    </div>
  );
};

export default UserShiftInfo;

// components/UserShiftInfo.tsx

import React from 'react';
import { UserData, AttendanceStatus, ShiftData } from '../types/user';
import { formatTime } from '../utils/dateUtils';
import { getDeviceType } from '../utils/deviceUtils';

interface UserShiftInfoProps {
  userData: UserData;
  attendanceStatus: AttendanceStatus;
  departmentName: string;
}

const UserShiftInfo: React.FC<UserShiftInfoProps> = ({
  userData,
  attendanceStatus,
  departmentName,
}) => {
  const shift: ShiftData | null | undefined =
    attendanceStatus.shiftAdjustment?.requestedShift || userData.assignedShift;
  const isEarlyCheckIn =
    shift && attendanceStatus.latestAttendance?.checkInTime
      ? new Date(attendanceStatus.latestAttendance.checkInTime).getHours() <
        parseInt(shift.startTime.split(':')[0], 10)
      : false;

  const checkShiftAdjustmentNeeded = () => {
    if (!shift) return false;

    const now = new Date();
    const shiftStart = new Date(`${now.toDateString()} ${shift.startTime}`);
    const shiftEnd = new Date(`${now.toDateString()} ${shift.endTime}`);

    if (shiftEnd < shiftStart) {
      shiftEnd.setDate(shiftEnd.getDate() + 1); // Handle overnight shifts
    }

    return now < shiftStart || now > shiftEnd;
  };

  const shiftAdjustmentNeeded = checkShiftAdjustmentNeeded();

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">
        {userData.name} (ID: {userData.employeeId})
      </h1>
      <p className="mb-4">Department: {departmentName}</p>

      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <h2 className="text-lg font-semibold mb-2">
          Current Status:{' '}
          {attendanceStatus.isCheckingIn ? 'Ready to Check In' : 'Checked In'}
        </h2>
        {!attendanceStatus.isCheckingIn &&
          attendanceStatus.latestAttendance && (
            <>
              <p>
                You checked in at:{' '}
                {formatTime(attendanceStatus.latestAttendance.checkInTime)}
              </p>
              <p>
                Method:{' '}
                {getDeviceType(
                  attendanceStatus.latestAttendance.checkInDeviceSerial,
                )}
              </p>
              {isEarlyCheckIn && shift && (
                <p className="text-yellow-600">
                  Note: You checked in early. Your shift starts at{' '}
                  {shift.startTime}.
                </p>
              )}
            </>
          )}

        {shift && (
          <>
            <h3 className="text-md font-semibold mt-4 mb-1">
              Your Shift Today:
            </h3>
            <p>
              {shift.name} ({shift.startTime} - {shift.endTime})
            </p>
            {attendanceStatus.shiftAdjustment && (
              <p className="text-blue-600">* Shift adjusted for today</p>
            )}
          </>
        )}

        {shiftAdjustmentNeeded && (
          <p className="text-red-500 mt-2">
            Your recent check-in is outside your scheduled shift.
          </p>
        )}
      </div>
    </div>
  );
};

export default UserShiftInfo;

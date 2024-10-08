//UserShiftInfo.tsx
import React, { useCallback, useMemo } from 'react';
import {
  AttendanceStatusInfo,
  ShiftData,
  ApprovedOvertime,
} from '../types/attendance';
import { UserData } from '../types/user';
import { format, isToday, parseISO } from 'date-fns';

interface UserShiftInfoProps {
  userData: UserData;
  attendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
}

const UserShiftInfo: React.FC<UserShiftInfoProps> = React.memo(
  ({ userData, attendanceStatus, effectiveShift }) => {
    const { latestAttendance } = attendanceStatus;

    const getStatusMessage = useMemo(() => {
      if (attendanceStatus.isDayOff) {
        return { message: 'วันหยุด', color: 'blue' };
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

      if (latestAttendance.checkOutTime) {
        return { message: 'ทำงานเสร็จแล้ว', color: 'green' };
      }

      if (latestAttendance.checkInTime) {
        return { message: 'อยู่ระหว่างเวลาทำงาน', color: 'orange' };
      }

      return { message: 'ยังไม่มีการลงเวลา', color: 'red' };
    }, [attendanceStatus.isDayOff, latestAttendance]);

    const renderTodayInfo = useMemo(() => {
      if (!attendanceStatus.isDayOff && (effectiveShift || latestAttendance)) {
        return (
          <>
            <div className="bg-white p-4 rounded-lg mb-4">
              {effectiveShift && (
                <>
                  <h3 className="text-md font-semibold mt-4 mb-1">
                    เวลาการทำงานของคุณวันนี้:
                  </h3>
                  <p className="text-gray-800">
                    <span className="font-medium">{effectiveShift.name}</span> (
                    {effectiveShift.startTime} - {effectiveShift.endTime})
                  </p>
                  {attendanceStatus.shiftAdjustment && (
                    <p className="text-blue-600 mt-1">
                      * เวลาทำงานได้รับการปรับเปลี่ยนสำหรับวันนี้
                    </p>
                  )}
                </>
              )}

              {latestAttendance && (
                <>
                  <p className="text-gray-800">
                    เวลาเข้างาน:{' '}
                    <span className="font-medium">
                      {latestAttendance.checkInTime || 'ยังไม่ได้ลงเวลา'}
                    </span>
                  </p>
                  <p className="text-gray-800">
                    เวลาออกงาน:{' '}
                    <span className="font-medium">
                      {latestAttendance.checkOutTime || 'ยังไม่ได้ลงเวลา'}
                    </span>
                  </p>
                </>
              )}
            </div>

            {attendanceStatus.approvedOvertime &&
              isOvertimeForToday(attendanceStatus.approvedOvertime) && (
                <div className="bg-white p-4 rounded-lg mb-4">
                  <h3 className="text-md font-semibold mt-4 mb-1">
                    รายละเอียดการทำงานล่วงเวลาที่ได้รับอนุมัติ:
                  </h3>
                  <p className="text-gray-800">
                    เวลาเริ่ม:{' '}
                    <span className="font-medium">
                      {format(
                        attendanceStatus.approvedOvertime.startTime,
                        'HH:mm:ss',
                      )}
                    </span>
                  </p>
                  <p className="text-gray-800">
                    เวลาสิ้นสุด:{' '}
                    <span className="font-medium">
                      {format(
                        attendanceStatus.approvedOvertime.endTime,
                        'HH:mm:ss',
                      )}
                    </span>
                  </p>
                  <p className="text-gray-800">
                    เวลาที่อนุมัติ:{' '}
                    <span className="font-medium">
                      {format(
                        parseISO(
                          attendanceStatus.approvedOvertime.approvedAt.toString(),
                        ),
                        'yyyy-MM-dd HH:mm:ss',
                      )}
                    </span>
                  </p>
                </div>
              )}
          </>
        );
      }

      if (
        attendanceStatus.isDayOff &&
        attendanceStatus.potentialOvertimes?.length > 0
      ) {
        return (
          <div className="bg-white p-4 rounded-lg mb-4 mt-2 text-yellow-600">
            <p>พบการทำงานนอกเวลาที่อาจยังไม่ได้รับอนุมัติ:</p>
            {attendanceStatus.potentialOvertimes.map((overtime, index) => (
              <p key={index} className="text-gray-800">
                {overtime.periods &&
                  overtime.periods.map((period, periodIndex) => (
                    <span key={periodIndex}>
                      {period.start} - {period.end}
                      {periodIndex < (overtime.periods?.length ?? 0) - 1 &&
                        ', '}
                    </span>
                  ))}
              </p>
            ))}
          </div>
        );
      }

      return null;
    }, [attendanceStatus, effectiveShift, latestAttendance]);

    const renderFutureInfo = useMemo(() => {
      const futureShiftAdjustments = attendanceStatus.futureShifts.filter(
        (adjustment) => !isToday(parseISO(adjustment.date)),
      );

      if (
        futureShiftAdjustments.length === 0 &&
        attendanceStatus.futureOvertimes.length === 0
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
              <h3 className="font-bold">
                Shift Adjustment on{' '}
                {format(parseISO(adjustment.date), 'dd MMM yyyy')}
              </h3>
              <p>Shift: {adjustment.shift?.name}</p>
              <p>
                Time: {adjustment.shift?.startTime} -{' '}
                {adjustment.shift?.endTime}{' '}
              </p>
            </div>
          ))}
          {attendanceStatus.futureOvertimes.map((overtime, index) => (
            <div
              key={`overtime-${index}`}
              className="bg-green-300 p-4 rounded-box mb-4"
            >
              <h3 className="font-bold">
                Approved Overtime on{' '}
                {format(parseISO(overtime.date.toString()), 'dd MMM yyyy')}
              </h3>
              <p>
                Time: {overtime.startTime} - {overtime.endTime}
              </p>
              <p>Reason: {overtime.reason}</p>
            </div>
          ))}
        </>
      );
    }, [attendanceStatus.futureShifts, attendanceStatus.futureOvertimes]);

    const isOvertimeForToday = useCallback((overtime: ApprovedOvertime) => {
      return isToday(parseISO(overtime.date.toString()));
    }, []);

    const { message, color } = getStatusMessage;

    return (
      <div className="flex flex-col">
        <div className="bg-white p-4 rounded-box mb-4 text-center">
          <p className="text-2xl font-bold">{userData.name}</p>
          <p className="text-xl">รหัสพนักงาน: {userData.employeeId}</p>
          <p className="text-gray-600">แผนก: {userData.departmentName}</p>

          <div className="flex flex-col items-center">
            <div className="flex items-center mt-2">
              <div
                className={`w-3 h-3 rounded-full bg-${color}-500 mr-2`}
              ></div>
              <span className="text-gray-600">{message}</span>
            </div>
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

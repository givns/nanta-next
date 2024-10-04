// components/CheckInOutForm.tsx

import React from 'react';
import { AttendanceStatusInfo, ShiftData } from '../types/attendance';
import { UserData } from '../types/user';
import { useSimpleAttendance } from '../hooks/useSimpleAttendance';

interface CheckInOutFormProps {
  onCloseWindow: () => void;
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  onStatusChange: (newStatus: boolean) => void;
  onError: () => void;
  isActionButtonReady: boolean;
}

const CheckInOutForm: React.FC<CheckInOutFormProps> = (props) => {
  console.log('CheckInOutForm initialized with props:', props);

  const { attendanceStatus, isLoading, error, location, checkInOutAllowance } =
    useSimpleAttendance(props.userData, props.initialAttendanceStatus);

  console.log('useSimpleAttendance result:', {
    attendanceStatus,
    isLoading,
    error,
    location,
    checkInOutAllowance,
  });

  return <div>CheckInOutForm Loaded Successfully</div>;
};

export default React.memo(CheckInOutForm);

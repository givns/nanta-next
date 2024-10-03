// components/CheckInOutForm.tsx

import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import Webcam from 'react-webcam';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ShiftData,
} from '../types/attendance';
import { UserData } from '../types/user';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import { useAttendance } from '../hooks/useAttendance';
import ErrorBoundary from './ErrorBoundary';
import { parseISO, isValid } from 'date-fns';
import { formatTime, getCurrentTime } from '../utils/dateUtils';
import { AppErrors } from '../utils/errorHandler';

interface CheckInOutFormProps {
  onCloseWindow: () => void;
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  onStatusChange: (newStatus: boolean) => void;
  onError: () => void;
  isActionButtonReady: boolean;
}

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  onCloseWindow,
  userData,
  initialAttendanceStatus,
  effectiveShift,
  onStatusChange,
  onError,
  isActionButtonReady,
}) => {
  console.log('CheckInOutForm render start', {
    userData,
    initialAttendanceStatus,
    effectiveShift,
    isActionButtonReady,
  });

  const [error, setError] = useState<string | null>(null);

  const {
    attendanceStatus,
    location,
    address,
    isOutsideShift,
    checkInOutAllowance,
    checkInOut,
    fetchCheckInOutAllowance,
    getCurrentLocation,
    refreshAttendanceStatus,
    isLoading,
    locationError,
  } = useAttendance(userData, initialAttendanceStatus);

  useEffect(() => {
    console.log('CheckInOutForm useEffect', {
      attendanceStatus,
      location,
      checkInOutAllowance,
      isLoading,
      locationError,
    });
  }, [
    attendanceStatus,
    location,
    checkInOutAllowance,
    isLoading,
    locationError,
  ]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h2>Check In/Out Form</h2>
      <p>User: {userData.name}</p>
      <p>Status: {attendanceStatus.status}</p>
      <p>
        Location: {location ? `${location.lat}, ${location.lng}` : 'Unknown'}
      </p>
      <p>Allowed: {checkInOutAllowance?.allowed ? 'Yes' : 'No'}</p>
      <button
        onClick={() =>
          checkInOut({
            employeeId: userData.employeeId,
            lineUserId: userData.lineUserId,
            isCheckIn: attendanceStatus.isCheckingIn,
            checkTime: new Date().toISOString(),
          })
        }
        disabled={!isActionButtonReady || !checkInOutAllowance?.allowed}
      >
        {attendanceStatus.isCheckingIn ? 'Check In' : 'Check Out'}
      </button>
    </div>
  );
};

export default React.memo(CheckInOutForm);

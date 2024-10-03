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

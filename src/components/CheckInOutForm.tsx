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

const MemoizedUserShiftInfo = React.memo(UserShiftInfo);

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  onCloseWindow,
  userData,
  initialAttendanceStatus,
  effectiveShift,
  onStatusChange,
  onError,
  isActionButtonReady,
}) => {
  const [step, setStep] = useState<'info' | 'camera' | 'processing'>('info');
  const [reason, setReason] = useState<string>('');
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [, setIsLate] = useState(false);
  const [, setIsOvertime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [, setIsCameraActive] = useState(false);
  const [locationError] = useState<string | null>(null);

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
  } = useAttendance(userData, initialAttendanceStatus);

  const handleError = useCallback(
    (error: Error | AppErrors) => {
      console.error('Error in CheckInOutForm:', error);
      setError(
        error instanceof AppErrors
          ? error.message
          : 'An unexpected error occurred',
      );
      onError();
    },
    [onError],
  );

  // Reset function to clear any stuck states
  const resetStates = useCallback(() => {
    setIsSubmitting(false);
    setCapturedPhoto(null);
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
    console.log('States reset');
  }, []);

  // Use effect to reset states if stuck in submitting for too long
  useEffect(() => {
    if (isSubmitting) {
      submitTimeoutRef.current = setTimeout(() => {
        console.log('Submission timeout - resetting states');
        resetStates();
      }, 30000); // 30 seconds timeout
    }
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, [isSubmitting, resetStates]);

  useEffect(() => {
    console.log('CheckInOutForm mounted');
    console.log(`userData: ${JSON.stringify(userData)}`);
    console.log(
      `initialAttendanceStatus: ${JSON.stringify(initialAttendanceStatus)}`,
    );
    console.log(`effectiveShift: ${JSON.stringify(effectiveShift)}`);

    try {
      if (initialAttendanceStatus?.latestAttendance) {
        const { checkInTime, checkOutTime, status } =
          initialAttendanceStatus.latestAttendance;
        console.log('Latest attendance:', {
          checkInTime,
          checkOutTime,
          status,
        });

        if (checkInTime) {
          const parsedCheckInTime = parseISO(checkInTime);
          if (isValid(parsedCheckInTime)) {
            console.log('Check-in time:', formatTime(parsedCheckInTime));
          } else {
            console.log('Invalid check-in time:', checkInTime);
          }
        } else {
          console.log('No check-in time available');
        }

        if (checkOutTime) {
          const parsedCheckOutTime = parseISO(checkOutTime);
          if (isValid(parsedCheckOutTime)) {
            console.log('Check-out time:', formatTime(parsedCheckOutTime));
          } else {
            console.log('Invalid check-out time:', checkOutTime);
          }
        } else {
          console.log('No check-out time available');
        }
      }

      if (effectiveShift) {
        console.log('Shift start time:', effectiveShift.startTime);
        console.log('Shift end time:', effectiveShift.endTime);
      }
    } catch (err) {
      handleError(err as Error);
    }
  }, [userData, initialAttendanceStatus, effectiveShift, handleError]);

  const content = (
    <ErrorBoundary>
      <div className="h-screen flex flex-col relative">
        {isSubmitting && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-white text-lg">กำลังบันทึกข้อมูล...</div>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <p className="text-red-500" role="alert">
              {error}
            </p>
          </div>
        )}
        <LateReasonModal
          isOpen={isLateModalOpen}
          onClose={() => {
            setIsLateModalOpen(false);
            resetStates();
          }}
          onSubmit={(lateReason) => {
            setIsLateModalOpen(false);
          }}
        />
      </div>
    </ErrorBoundary>
  );

  if (error) {
    return (
      <div
        className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
        role="alert"
      >
        <strong className="font-bold">Error:</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  return content;
};

export default React.memo(CheckInOutForm);

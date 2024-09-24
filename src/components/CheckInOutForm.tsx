// components/CheckInOutForm.tsx

import React, { useState, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import {
  AttendanceData,
  AttendanceStatusInfo,
  ShiftData,
  CheckInOutAllowance,
} from '../types/attendance';
import { UserData } from '../types/user';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import { useAttendance } from '../hooks/useAttendance';
import ErrorBoundary from './ErrorBoundary';
import liff from '@line/liff';
import { format, parseISO, isValid } from 'date-fns';
import { formatTime, getBangkokTime } from '../utils/dateUtils';
import { debounce, set } from 'lodash';

interface CheckInOutFormProps {
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  initialCheckInOutAllowance: CheckInOutAllowance;
  onStatusChange: (newStatus: boolean) => void;
  onError: () => void;
}

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  initialAttendanceStatus,
  effectiveShift,
  initialCheckInOutAllowance,
  onStatusChange,
  onError,
}) => {
  const [step, setStep] = useState<'info' | 'camera' | 'processing'>('info');
  const [reason, setReason] = useState<string>('');
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isLate, setIsLate] = useState(false);
  const [isOvertime, setIsOvertime] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [buttonState, setButtonState] = useState(initialCheckInOutAllowance);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addDebugLog = useCallback((message: string) => {
    setDebugLog((prev) => {
      const newLog = [...prev, `${new Date().toISOString()}: ${message}`];
      console.log(message); // Log to console as well
      return newLog;
    });
  }, []);

  const {
    attendanceStatus,
    location,
    address,
    isOutsideShift,
    checkInOutAllowance,
    checkInOut,
    isCheckInOutAllowed,
    refreshAttendanceStatus,
  } = useAttendance(
    userData,
    initialAttendanceStatus,
    initialCheckInOutAllowance,
  );

  useEffect(() => {
    console.log('CheckInOutForm mounted');
    console.log('userData:', userData);
    console.log('initialAttendanceStatus:', initialAttendanceStatus);
    console.log('effectiveShift:', effectiveShift);

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
      console.error('Error in CheckInOutForm:', err);
      onError(); // Remove the argument from the function call
    }
  }, [userData, initialAttendanceStatus, effectiveShift, onError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setButtonState(checkInOutAllowance || { allowed: false });
    }, 500);

    return () => clearTimeout(timer);
  }, [checkInOutAllowance]);

  const closeLiffWindow = async () => {
    try {
      await liff.init({
        liffId: process.env.NEXT_PUBLIC_LIFF_ID as string,
      });
      setTimeout(() => {
        liff.closeWindow();
      }, 2000); // Close the window after 2 seconds
    } catch (error) {
      console.error('Error closing LIFF window:', error);
    }
  };
  const submitCheckInOut = useCallback(
    async (photo: string, lateReasonInput?: string) => {
      addDebugLog('submitCheckInOut called');
      if (!location) {
        addDebugLog(`Cannot submit: location not available`);
        return;
      }
      if (isSubmitting) {
        addDebugLog('Submission already in progress, skipping');
        return;
      }
      setIsSubmitting(true);
      addDebugLog('Setting isSubmitting to true');

      setError(null);

      const checkInOutData: AttendanceData = {
        employeeId: userData.employeeId,
        lineUserId: userData.lineUserId,
        checkTime: new Date(),
        [attendanceStatus.isCheckingIn ? 'checkInAddress' : 'checkOutAddress']:
          address,
        reason: lateReasonInput || reason,
        isCheckIn: attendanceStatus.isCheckingIn,
        isOvertime,
        isLate,
        photo,
      };

      addDebugLog(`Sending data to API: ${JSON.stringify(checkInOutData)}`);

      try {
        const response = await checkInOut(checkInOutData);
        addDebugLog(`API response received: ${JSON.stringify(response)}`);

        onStatusChange(!attendanceStatus.isCheckingIn);
        await refreshAttendanceStatus();
        setStep('info');
        await closeLiffWindow();
      } catch (error: any) {
        addDebugLog(`Error during check-in/out: ${error.message}`);
        setError('Failed to submit check-in/out. Please try again.');
      } finally {
        setIsSubmitting(false);
        addDebugLog('Setting isSubmitting to false');
      }
    },
    [
      location,
      userData,
      attendanceStatus,
      address,
      reason,
      isOvertime,
      isLate,
      checkInOut,
      onStatusChange,
      refreshAttendanceStatus,
      closeLiffWindow,
      addDebugLog,
    ],
  );

  const handlePhotoCapture = useCallback(
    async (photo: string) => {
      addDebugLog('Photo captured');
      if (isSubmitting) {
        addDebugLog('Submission already in progress, skipping photo capture');
        return;
      }
      try {
        const {
          allowed,
          reason: checkInOutReason,
          isLate,
          isOvertime,
        } = await isCheckInOutAllowed();

        addDebugLog(
          `Check-in/out allowed: ${allowed}, isLate: ${isLate}, isOvertime: ${isOvertime}`,
        );

        if (!allowed) {
          setError(
            checkInOutReason || 'Check-in/out is not allowed at this time.',
          );
          return;
        }

        setIsLate(isLate ?? false);
        setIsOvertime(isOvertime || false);

        if ((isLate ?? false) && attendanceStatus.isCheckingIn) {
          setIsLateModalOpen(true);
          setReason('');
          addDebugLog('Late modal opened');
        } else {
          addDebugLog('Proceeding to submit check-in/out');
          setStep('processing');
          await submitCheckInOut(photo);
        }
      } catch (error) {
        addDebugLog(`Error in handlePhotoCapture: ${error}`);
        setError('An error occurred. Please try again.');
      }
    },
    [
      isSubmitting,
      isCheckInOutAllowed,
      attendanceStatus.isCheckingIn,
      submitCheckInOut,
      addDebugLog,
    ],
  );

  const { webcamRef, isModelLoading, message } = useFaceDetection(
    5,
    handlePhotoCapture,
  );

  const handleLateReasonSubmit = useCallback(
    async (lateReason: string) => {
      setIsLateModalOpen(false);
      setStep('processing');
      const photo = webcamRef.current?.getScreenshot();
      if (photo) {
        await submitCheckInOut(photo, lateReason);
      } else {
        setError('Failed to capture photo. Please try again.');
      }
    },
    [submitCheckInOut, webcamRef],
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

  const renderStep1 = () => (
    <div className="flex flex-col h-full">
      <ErrorBoundary>
        <UserShiftInfo
          userData={userData}
          attendanceStatus={attendanceStatus}
          effectiveShift={effectiveShift}
          isOutsideShift={isOutsideShift}
        />
      </ErrorBoundary>
      <div className="flex-shrink-0 mt-4">{renderActionButton()}</div>
    </div>
  );

  const renderActionButton = () => {
    const buttonClass = `w-full ${
      buttonState?.allowed
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-gray-400 cursor-not-allowed'
    } text-white py-3 px-4 rounded-lg transition duration-300`;

    let buttonText = 'ไม่สามารถลงเวลาได้ในขณะนี้';
    if (buttonState?.allowed) {
      buttonText = `เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
    }

    return (
      <>
        <button
          onClick={() =>
            handleAction(attendanceStatus.isCheckingIn ? 'checkIn' : 'checkOut')
          }
          disabled={!buttonState?.allowed}
          className={buttonClass}
          aria-label={buttonText}
        >
          {buttonText}
        </button>
        {!buttonState?.allowed && buttonState?.reason && (
          <p className="text-red-500 text-center text-sm mt-2">
            {buttonState.reason}
          </p>
        )}
        {buttonState?.countdown !== undefined && (
          <p className="text-blue-500 text-center text-sm mt-2">
            สามารถลงเวลาได้ในอีก {buttonState.countdown} นาที
          </p>
        )}
      </>
    );
  };

  const handleAction = (action: 'checkIn' | 'checkOut') => {
    if (isSubmitting) return; // Prevent multiple submissions
    if (action === 'checkOut' && !confirmEarlyCheckOut()) {
      return;
    }
    setStep('camera');
    setIsSubmitting(true); // Set submitting flag to true
  };

  const confirmEarlyCheckOut = () => {
    if (!effectiveShift) return true;

    const now = getBangkokTime();
    const shiftEnd = parseISO(effectiveShift.endTime);
    if (now < shiftEnd) {
      const confirmed = window.confirm(
        'คุณกำลังจะลงเวลาออกก่อนเวลาเลิกงาน หากคุณต้องการลาป่วยฉุกเฉิน กรุณายื่นคำขอลาในระบบ คุณต้องการลงเวลาออกหรือไม่?',
      );
      if (confirmed) {
        // Redirect to leave request page
        window.location.href = '/leave-request';
        return false;
      }
    }
    return true;
  };

  const renderStep2 = () => (
    <div className="h-full flex flex-col justify-center">
      {isModelLoading ? (
        <SkeletonLoader />
      ) : (
        <>
          <Webcam
            audio={false}
            ref={webcamRef}
            screenshotFormat="image/jpeg"
            className="w-full rounded-lg mb-4"
          />
          <p className="text-center mb-2">{message}</p>
        </>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="h-full flex flex-col justify-center items-center">
      <p className="text-lg font-semibold mb-4">
        Processing your attendance...
      </p>
      <SkeletonLoader />
    </div>
  );

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col">
        <div className="flex-grow overflow-hidden flex flex-col">
          {step === 'info' && renderStep1()}
          {step === 'camera' && renderStep2()}
          {step === 'processing' && renderStep3()}
        </div>
        {error && (
          <div className="mt-4">
            <p className="text-red-500" role="alert">
              {error}
            </p>
          </div>
        )}
        <LateReasonModal
          isOpen={isLateModalOpen}
          onClose={() => setIsLateModalOpen(false)}
          onSubmit={handleLateReasonSubmit}
        />
        <div className="mt-4 text-sm text-gray-500 max-h-40 overflow-y-auto">
          {debugLog.map((log, index) => (
            <div key={index}>{log}</div>
          ))}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default CheckInOutForm;

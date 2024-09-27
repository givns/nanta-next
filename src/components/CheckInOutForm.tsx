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
import { parseISO, isValid } from 'date-fns';
import { formatTime, getCurrentTime } from '../utils/dateUtils';

interface CheckInOutFormProps {
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  initialCheckInOutAllowance: CheckInOutAllowance;
  onStatusChange: (newStatus: boolean) => void;
  onError: () => void;
}

const MemoizedUserShiftInfo = React.memo(UserShiftInfo);

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
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [buttonState, setButtonState] = useState(initialCheckInOutAllowance);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isDebugLogExpanded, setIsDebugLogExpanded] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const addDebugLog = useCallback((message: string) => {
    setDebugLog((prev) => {
      const newLog = [...prev, `${new Date().toISOString()}: ${message}`];
      console.log(message);
      return newLog;
    });
  }, []);

  // Reset function to clear any stuck states
  const resetStates = useCallback(() => {
    setIsSubmitting(false);
    setCapturedPhoto(null);
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
    addDebugLog('States reset');
  }, [addDebugLog]);

  // Use effect to reset states if stuck in submitting for too long
  useEffect(() => {
    if (isSubmitting) {
      submitTimeoutRef.current = setTimeout(() => {
        addDebugLog('Submission timeout - resetting states');
        resetStates();
      }, 30000); // 30 seconds timeout
    }
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, [isSubmitting, resetStates, addDebugLog]);

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
    addDebugLog('CheckInOutForm mounted');
    addDebugLog(`userData: ${JSON.stringify(userData)}`);
    addDebugLog(
      `initialAttendanceStatus: ${JSON.stringify(initialAttendanceStatus)}`,
    );
    addDebugLog(`effectiveShift: ${JSON.stringify(effectiveShift)}`);

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
  }, [userData, initialAttendanceStatus, effectiveShift, addDebugLog, onError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setButtonState(checkInOutAllowance || { allowed: false });
    }, 500);

    return () => clearTimeout(timer);
  }, [checkInOutAllowance]);

  const closeLiffWindow = useCallback(async () => {
    try {
      await liff.init({
        liffId: process.env.NEXT_PUBLIC_LIFF_ID as string,
      });
      setTimeout(() => {
        liff.closeWindow();
      }, 2000);
    } catch (error) {
      console.error('Error closing LIFF window:', error);
    }
  }, []);

  const MAX_RETRIES = 3;
  let retryCount = 0;

  const submitCheckInOut = useCallback(
    async (photo: string, lateReasonInput?: string) => {
      if (isSubmitting || !location || !photo) {
        addDebugLog(
          `Cannot submit: isSubmitting: ${isSubmitting}, location: ${!!location}, photo: ${!!photo}`,
        );
        return;
      }

      setIsSubmitting(true);
      addDebugLog('Setting isSubmitting to true');

      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }

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

      const attemptSubmit = async () => {
        try {
          const response = await checkInOut(checkInOutData);
          addDebugLog(`API response received: ${JSON.stringify(response)}`);

          onStatusChange(!attendanceStatus.isCheckingIn);
          await refreshAttendanceStatus();
          setStep('info');
          await closeLiffWindow();
        } catch (error: any) {
          if (
            error.response &&
            error.response.status === 429 &&
            retryCount < MAX_RETRIES
          ) {
            addDebugLog(
              `Rate limit reached. Retry ${retryCount + 1} of ${MAX_RETRIES} in 5 seconds...`,
            );
            retryCount++;
            submitTimeoutRef.current = setTimeout(attemptSubmit, 5000);
          } else if (!error.response && error.request) {
            addDebugLog(
              'Network error. Please check your connection and try again.',
            );
            setError(
              'Network error. Please check your connection and try again.',
            );
          } else {
            addDebugLog(`Error during check-in/out: ${error.message}`);
            setError('Failed to submit check-in/out. Please try again.');
          }
        } finally {
          if (!submitTimeoutRef.current) {
            setIsSubmitting(false);
          }
        }
      };

      attemptSubmit();
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
      closeLiffWindow,
      onStatusChange,
      refreshAttendanceStatus,

      addDebugLog,
    ],
  );

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const handlePhotoCapture = useCallback(
    (photo: string) => {
      if (isSubmitting) return; // Prevent multiple captures while submitting
      setIsSubmitting(true);
      addDebugLog('Photo captured');
      setCapturedPhoto(photo);
      setIsCameraActive(false); // Close the camera after capturing
      addDebugLog('Camera deactivated, photo stored');
    },
    [addDebugLog, isSubmitting],
  );

  const { webcamRef, isModelLoading, message, resetDetection } =
    useFaceDetection(5, handlePhotoCapture);

  useEffect(() => {
    const processCapture = async () => {
      if (!capturedPhoto) return;

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
          resetStates();
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
          await submitCheckInOut(capturedPhoto);
        }
      } catch (error) {
        addDebugLog(`Error in processCapture: ${error}`);
        setError('An error occurred. Please try again.');
        resetStates();
      } finally {
        setIsSubmitting(false);
      }
    };
    processCapture();
  }, [
    capturedPhoto,
    isCheckInOutAllowed,
    attendanceStatus.isCheckingIn,
    submitCheckInOut,
    addDebugLog,
    resetStates,
    isSubmitting,
  ]);

  const handleLateReasonSubmit = useCallback(
    async (lateReason: string) => {
      setIsLateModalOpen(false);
      setStep('processing');
      if (capturedPhoto) {
        await submitCheckInOut(capturedPhoto, lateReason);
      } else {
        setError('Failed to capture photo. Please try again.');
        resetStates();
      }
    },
    [submitCheckInOut, capturedPhoto, resetStates],
  );

  const confirmEarlyCheckOut = useCallback(() => {
    if (!effectiveShift) return true;

    const now = getCurrentTime();
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
  }, [effectiveShift]);

  const renderActionButton = useCallback(() => {
    if (locationError) {
      return (
        <div className="text-red-500 text-center">
          {locationError}
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-blue-500 underline"
          >
            Retry
          </button>
        </div>
      );
    }
    const handleAction = async (action: 'checkIn' | 'checkOut') => {
      if (action === 'checkOut' && !confirmEarlyCheckOut()) {
        return;
      }
      const allowance = await isCheckInOutAllowed();
      if (allowance.allowed) {
        setStep('camera');
        setIsCameraActive(true);
        resetDetection();
        addDebugLog('Camera activated for check-in/out');
      } else {
        setError(
          allowance.reason || 'Check-in/out is not allowed at this time.',
        );
      }
    };

    const buttonClass = `w-full ${
      checkInOutAllowance?.allowed
        ? 'bg-red-600 hover:bg-red-700'
        : 'bg-gray-400 cursor-not-allowed'
    } text-white py-3 px-4 rounded-lg transition duration-300`;

    let buttonText = 'ไม่สามารถลงเวลาได้ในขณะนี้';
    if (checkInOutAllowance?.allowed) {
      buttonText = `เปิดกล้องเพื่อ${attendanceStatus.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
    }

    return (
      <>
        <button
          onClick={() =>
            handleAction(attendanceStatus.isCheckingIn ? 'checkIn' : 'checkOut')
          }
          disabled={!checkInOutAllowance?.allowed}
          className={buttonClass}
          aria-label={buttonText}
        >
          {buttonText}
        </button>
        {!checkInOutAllowance?.allowed && checkInOutAllowance?.reason && (
          <p className="text-red-500 text-center text-sm mt-2">
            {checkInOutAllowance.reason}
          </p>
        )}
        {checkInOutAllowance?.countdown !== undefined && (
          <p className="text-blue-500 text-center text-sm mt-2">
            สามารถลงเวลาได้ในอีก {checkInOutAllowance.countdown} นาที
          </p>
        )}
        {checkInOutAllowance?.isLate && (
          <p className="text-yellow-500 text-center text-sm mt-2">
            คุณกำลังเข้างานสาย
          </p>
        )}
        {checkInOutAllowance?.isOvertime && (
          <p className="text-purple-500 text-center text-sm mt-2">
            คุณกำลังทำงานล่วงเวลา
          </p>
        )}
      </>
    );
  }, [
    checkInOutAllowance,
    attendanceStatus.isCheckingIn,
    locationError,
    confirmEarlyCheckOut,
    isCheckInOutAllowed,
    setStep,
    setIsCameraActive,
    resetDetection,
    addDebugLog,
    setError,
  ]);

  const renderStep1 = useMemo(
    () => (
      <div className="flex flex-col h-full">
        <ErrorBoundary>
          <MemoizedUserShiftInfo
            userData={userData}
            attendanceStatus={attendanceStatus}
            effectiveShift={effectiveShift}
            isOutsideShift={isOutsideShift}
          />
        </ErrorBoundary>
        <div className="flex-shrink-0 mt-4">{renderActionButton()}</div>
      </div>
    ),
    [
      userData,
      attendanceStatus,
      effectiveShift,
      isOutsideShift,
      renderActionButton,
    ],
  );

  const renderStep2 = useCallback(
    () => (
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
    ),
    [isModelLoading, webcamRef, message],
  );

  const renderStep3 = useCallback(
    () => (
      <div className="h-full flex flex-col justify-center items-center">
        <p className="text-lg font-semibold mb-4">
          Processing your attendance...
        </p>
        <SkeletonLoader />
      </div>
    ),
    [],
  );

  const toggleDebugLog = useCallback(() => {
    setIsDebugLogExpanded((prev) => !prev);
  }, []);

  const renderDebugLog = useMemo(
    () => (
      <div className="mt-4">
        <button
          onClick={toggleDebugLog}
          className="text-sm text-blue-500 underline mb-2"
        >
          {isDebugLogExpanded ? 'Hide Debug Log' : 'Show Debug Log'}
        </button>
        {isDebugLogExpanded && (
          <div className="text-sm text-gray-500 max-h-40 overflow-y-auto border border-gray-300 p-2 rounded">
            {debugLog.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        )}
      </div>
    ),
    [debugLog, isDebugLogExpanded, toggleDebugLog],
  );

  const content = (
    <ErrorBoundary>
      <div className="h-screen flex flex-col">
        <div className="flex-grow overflow-hidden flex flex-col">
          {step === 'info' && renderStep1}
          {step === 'camera' && renderStep2()}
          {step === 'processing' && renderStep3()}
          <button
            onClick={() => {
              resetStates();
              resetDetection();
              setIsCameraActive(false);
              setStep('info');
            }}
            className="mt-2 text-blue-500 underline"
          >
            Reset (Debug)
          </button>
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
        {renderDebugLog}
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

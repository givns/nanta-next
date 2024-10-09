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
  CheckInOutAllowance,
  ShiftData,
} from '../types/attendance';
import { UserData } from '../types/user';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import ErrorBoundary from './ErrorBoundary';
import { parseISO, isValid } from 'date-fns';
import { formatTime, getCurrentTime } from '../utils/dateUtils';
import { useSimpleAttendance } from '../hooks/useSimpleAttendance';

interface CheckInOutFormProps {
  onCloseWindow: () => void;
  userData: UserData;
  initialAttendanceStatus: AttendanceStatusInfo;
  effectiveShift: ShiftData | null;
  onStatusChange: (newStatus: boolean) => void;
  onError: () => void;
  isActionButtonReady: boolean;
  checkInOutAllowance: CheckInOutAllowance | null;
  isCheckingIn: boolean;
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
  isCheckingIn,
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
  const [timeRemaining, setTimeRemaining] = useState(15);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    attendanceStatus,
    location,
    address,
    isOutsideShift,
    checkInOutAllowance,
    checkInOut,
    refreshAttendanceStatus,
  } = useSimpleAttendance(
    userData.employeeId,
    userData.lineUserId,
    initialAttendanceStatus,
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

  useEffect(() => {
    if (effectiveShift) {
      console.log('Effective shift:', effectiveShift);
    } else {
      console.log('Effective shift is not available');
    }
  }, [effectiveShift]);

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
      onError();
    }
  }, [userData, initialAttendanceStatus, effectiveShift, onError]);

  const submitCheckInOut = useCallback(
    async (photo: string, lateReason?: string) => {
      if (!location) {
        onError();
        return;
      }

      const checkInOutData: AttendanceData = {
        employeeId: userData.employeeId,
        lineUserId: userData.lineUserId,
        checkTime: new Date(),
        [attendanceStatus.isCheckingIn ? 'checkInAddress' : 'checkOutAddress']:
          address,
        reason: lateReason || reason,
        isCheckIn: attendanceStatus.isCheckingIn,
        isOvertime: checkInOutAllowance?.isOvertime || false,
        isLate: checkInOutAllowance?.isLate || false,
        photo,
      };

      console.log(`Sending data to API: ${JSON.stringify(checkInOutData)}`);

      try {
        const response = await checkInOut(checkInOutData);
        console.log(`API response received: ${JSON.stringify(response)}`);

        onStatusChange(!attendanceStatus.isCheckingIn);
        await refreshAttendanceStatus();
        await onCloseWindow();
      } catch (error: any) {
        console.log(`Error during check-in/out: ${error.message}`);
        setError('Failed to submit check-in/out. Please try again.');
      }
    },
    [
      location,
      userData,
      attendanceStatus,
      address,
      reason,
      checkInOutAllowance,
      checkInOut,
      onStatusChange,
      refreshAttendanceStatus,
      onCloseWindow,
      onError,
    ],
  );

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
      }
    };
  }, []);

  const processAttendanceSubmission = useCallback(
    async (photo: string, lateReason?: string) => {
      if (!checkInOutAllowance?.allowed) {
        setError('Check-in/out is no longer allowed. Please try again.');
        resetStates();
        return;
      }

      try {
        setIsSubmitting(true);
        setStep('processing');
        await submitCheckInOut(photo, lateReason);
      } catch (error) {
        setError('An error occurred. Please try again.');
        resetStates();
      } finally {
        setIsSubmitting(false);
      }
    },
    [checkInOutAllowance, submitCheckInOut, setError, resetStates],
  );

  const handlePhotoCapture = useCallback(
    async (photo: string) => {
      if (isSubmitting) return; // Prevent multiple captures while submitting
      setCapturedPhoto(photo);
      setIsCameraActive(false); // Close the camera after capturing

      try {
        await processAttendanceSubmission(photo);
      } catch (error) {
        console.error('Error processing photo:', error);
        setError('An error occurred. Please try again.');
        resetStates();
      }
    },
    [
      isSubmitting,
      processAttendanceSubmission,
      setCapturedPhoto,
      setIsCameraActive,
      setError,
      resetStates,
    ],
  );

  useEffect(() => {
    const processCapture = async () => {
      if (!capturedPhoto) return;

      try {
        if (checkInOutAllowance) {
          console.log(
            `Check-in/out allowed: ${checkInOutAllowance.allowed}, isLate: ${checkInOutAllowance.isLate ?? false}, isOvertime: ${checkInOutAllowance.isOvertime ?? false}`,
          );

          if (!checkInOutAllowance.allowed) {
            setError(
              checkInOutAllowance.reason ||
                'Check-in/out is not allowed at this time.',
            );
            resetStates();
            return;
          }

          setIsLate(checkInOutAllowance.isLate ?? false);
          setIsOvertime(checkInOutAllowance.isOvertime ?? false);

          if (checkInOutAllowance.isLate && attendanceStatus.isCheckingIn) {
            setIsLateModalOpen(true);
            setReason('');
            console.log('Late modal opened');
          } else {
            console.log('Proceeding to submit check-in/out');
            setStep('processing');
            await submitCheckInOut(capturedPhoto);
          }
        } else {
          throw new Error('Check-in/out allowance information is missing');
        }
      } catch (error) {
        console.log(`Error in processCapture: ${error}`);
        setError('An error occurred. Please try again.');
        resetStates();
      } finally {
        setIsSubmitting(false);
      }
    };
    processCapture();
  }, [
    capturedPhoto,
    checkInOutAllowance,
    attendanceStatus.isCheckingIn,
    submitCheckInOut,
    resetStates,
  ]);

  const {
    webcamRef,
    isModelLoading,
    faceDetectionCount,
    message,
    resetDetection,
    captureThreshold,
  } = useFaceDetection(5, handlePhotoCapture);

  const confirmEarlyCheckOut = useCallback(() => {
    if (!effectiveShift) return true;

    const now = getCurrentTime();
    const shiftEnd = parseISO(effectiveShift.endTime);
    if (now < shiftEnd) {
      const confirmed = window.confirm(
        'คุณกำลังจะลงเวลาออกก่อนเวลาเลิกงาน หากคุณต้องการลาป่วยฉุกเฉิน กรุณายื่นคำขอลาในระบบ คุณต้องการลงเวลาออกหรือไม่?',
      );
      if (confirmed) {
        window.location.href = '/leave-request';
        return false;
      }
    }
    return true;
  }, [effectiveShift]);

  useEffect(() => {
    if (step === 'info') {
      setTimeRemaining(30);
      timerRef.current = setInterval(() => {
        setTimeRemaining((prevTime) => {
          if (prevTime <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            onCloseWindow();
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [step, onCloseWindow]);

  const handleAction = useCallback(
    async (action: 'checkIn' | 'checkOut') => {
      console.log('handleAction called with:', action);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      try {
        // Determine if it's a check-in or check-out based on the current attendance status
        const isCheckIn = attendanceStatus.isCheckingIn;
        console.log(`Action is ${isCheckIn ? 'check-in' : 'check-out'}`);

        if (action === 'checkOut' && !confirmEarlyCheckOut()) {
          return;
        }

        // Use the existing checkInOutAllowance without fetching again
        if (checkInOutAllowance?.allowed) {
          setStep('camera');
          setIsCameraActive(true);
          resetDetection();
        } else {
          setError(
            checkInOutAllowance?.reason ||
              'Check-in/out is not allowed at this time.',
          );
        }
      } catch (error) {
        console.error('Error in handleAction:', error);
        setError('An unexpected error occurred. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [
      attendanceStatus.isCheckingIn,
      confirmEarlyCheckOut,
      checkInOutAllowance,
      setStep,
      setIsCameraActive,
      resetDetection,
    ],
  );

  const renderActionButton = useCallback(() => {
    if (locationError) {
      return (
        <div className="text-red-500 text-center">
          {locationError}
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="mt-2 text-blue-500 underline"
          >
            Retry
          </button>
        </div>
      );
    }

    const buttonClass = `w-full ${checkInOutAllowance?.allowed ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-400 cursor-not-allowed'} text-white py-3 px-4 rounded-lg transition duration-300`;

    let buttonText = 'ไม่สามารถลงเวลาได้ในขณะนี้';
    if (isActionButtonReady) {
      if (checkInOutAllowance?.allowed) {
        buttonText = `เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
      } else if (attendanceStatus.pendingLeaveRequest) {
        buttonText = 'รออนุมัติการลา';
      }
    } else {
      buttonText = 'กรุณารอสักครู่...';
    }

    return (
      <>
        <button
          onClick={() =>
            handleAction(attendanceStatus.isCheckingIn ? 'checkIn' : 'checkOut')
          }
          disabled={!isActionButtonReady || !checkInOutAllowance?.allowed}
          className="w-full py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400"
          aria-label={buttonText}
        >
          {buttonText}
        </button>
        {!checkInOutAllowance?.allowed && checkInOutAllowance?.reason && (
          <p className="text-red-500 text-center text-sm mt-2">
            {checkInOutAllowance.reason}
          </p>
        )}
        {checkInOutAllowance?.isOutsideShift && (
          <p className="text-yellow-500 text-center text-sm mt-2">
            คุณอยู่นอกเวลาทำงานของกะ
          </p>
        )}
        {checkInOutAllowance?.isLate && (
          <p className="text-red-500 text-center text-sm mt-2">
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
    attendanceStatus.pendingLeaveRequest,
    locationError,
    handleAction,
    isActionButtonReady,
  ]);

  const renderStep1 = useMemo(
    () => (
      <div className="flex flex-col h-full">
        <ErrorBoundary>
          <MemoizedUserShiftInfo
            userData={userData}
            attendanceStatus={attendanceStatus}
            effectiveShift={effectiveShift}
          />
        </ErrorBoundary>
        <div className="flex-shrink-0 mt-4">
          {renderActionButton()}
          <p className="text-center mt-2">
            ท่านมีเวลาในการทำรายการ {timeRemaining} วินาที
          </p>
        </div>
      </div>
    ),
    [
      userData,
      attendanceStatus,
      effectiveShift,
      renderActionButton,
      timeRemaining,
    ],
  );

  const renderStep2 = () => (
    <div className="h-full flex flex-col justify-center items-center relative">
      {isModelLoading ? (
        <SkeletonLoader />
      ) : (
        <>
          <div className="relative">
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="w-full rounded-lg mb-4"
              videoConstraints={{
                facingMode: 'user',
              }}
            />
            {/* Overlay Frame */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-4 border-blue-500 rounded-full w-48 h-48"></div>
            </div>
          </div>
          <p className="text-center mb-2">{message}</p>
          {/* Progress Indicator */}
          {faceDetectionCount > 0 && (
            <div className="w-full px-4">
              <div className="bg-gray-200 h-2 rounded-full">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{
                    width: `${(faceDetectionCount / captureThreshold) * 100}%`,
                  }}
                ></div>
              </div>
              <p className="text-center text-sm mt-1">
                {faceDetectionCount} / {captureThreshold}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderStep3 = useCallback(
    () => (
      <div className="h-full flex flex-col justify-center items-center">
        <p className="text-lg font-semibold mb-4">ระบบกำลังลงเวลา...</p>
        <SkeletonLoader />
      </div>
    ),
    [],
  );

  const content = (
    <ErrorBoundary>
      <div className="h-screen flex flex-col relative">
        {isSubmitting && (
          <div className="absolute inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-white text-lg">กำลังบันทึกข้อมูล...</div>
          </div>
        )}
        <div className="flex-grow overflow-hidden flex flex-col">
          {step === 'info' && renderStep1}
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
          onClose={() => {
            setIsLateModalOpen(false);
            resetStates();
          }}
          onSubmit={(lateReason) => {
            setIsLateModalOpen(false);
            processAttendanceSubmission(capturedPhoto!, lateReason);
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

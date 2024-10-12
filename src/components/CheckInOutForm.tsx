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
  userData: UserData;
  cachedAttendanceStatus: AttendanceStatusInfo | null;
  liveAttendanceStatus: AttendanceStatusInfo | null;
  effectiveShift: ShiftData | null;
  isAttendanceLoading: boolean;
  checkInOutAllowance: CheckInOutAllowance | null;
  refreshAttendanceStatus: (forceRefresh: boolean) => Promise<void>;
  onStatusChange: (newStatus: boolean) => Promise<void>;
  onCloseWindow: () => void;
}

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  cachedAttendanceStatus,
  liveAttendanceStatus,
  effectiveShift,
  isAttendanceLoading,
  checkInOutAllowance,
  refreshAttendanceStatus,
  onStatusChange,
  onCloseWindow,
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
  const [isActionButtonReady, setIsActionButtonReady] = useState(false);

  const resetStates = useCallback(() => {
    setIsSubmitting(false);
    setCapturedPhoto(null);
    setError(null);
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (checkInOutAllowance !== null) {
      setIsActionButtonReady(true);
    }
  }, [checkInOutAllowance]);

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

  const submitCheckInOut = useCallback(
    async (photo: string, lateReason?: string) => {
      try {
        setIsSubmitting(true);
        await onStatusChange(liveAttendanceStatus?.isCheckingIn ?? true);
        await refreshAttendanceStatus(true);
        await onCloseWindow();
      } catch (error: any) {
        console.log(`Error during check-in/out: ${error.message}`);
        setError('Failed to submit check-in/out. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      liveAttendanceStatus,
      onStatusChange,
      refreshAttendanceStatus,
      onCloseWindow,
    ],
  );

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
    [checkInOutAllowance, submitCheckInOut, resetStates],
  );

  const processCapture = useCallback(async () => {
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

        if (checkInOutAllowance.isLate && liveAttendanceStatus?.isCheckingIn) {
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
  }, [
    capturedPhoto,
    checkInOutAllowance,
    liveAttendanceStatus?.isCheckingIn,
    submitCheckInOut,
    resetStates,
  ]);

  useEffect(() => {
    if (capturedPhoto) {
      processCapture();
    }
  }, [capturedPhoto, processCapture]);

  const handlePhotoCapture = useCallback(
    async (photo: string) => {
      if (isSubmitting) return;
      setCapturedPhoto(photo);
    },
    [isSubmitting],
  );

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
        const isCheckIn = liveAttendanceStatus?.isCheckingIn ?? true;
        console.log(`Action is ${isCheckIn ? 'check-in' : 'check-out'}`);

        if (action === 'checkOut' && !confirmEarlyCheckOut()) {
          return;
        }

        if (checkInOutAllowance?.allowed) {
          setStep('camera');
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
      }
    },
    [
      liveAttendanceStatus,
      confirmEarlyCheckOut,
      checkInOutAllowance,
      resetDetection,
    ],
  );

  const memoizedUserShiftInfo = useMemo(
    () => (
      <UserShiftInfo
        userData={userData}
        attendanceStatus={liveAttendanceStatus || cachedAttendanceStatus}
        effectiveShift={effectiveShift}
      />
    ),
    [userData, liveAttendanceStatus, cachedAttendanceStatus, effectiveShift],
  );

  const memoizedActionButton = useMemo(
    () => (
      <button
        onClick={() =>
          handleAction(
            liveAttendanceStatus?.isCheckingIn ? 'checkIn' : 'checkOut',
          )
        }
        disabled={!isActionButtonReady || !checkInOutAllowance?.allowed}
        className="w-full py-2 px-4 border border-transparent rounded-full shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:bg-gray-400"
      >
        {isActionButtonReady
          ? checkInOutAllowance?.allowed
            ? `เปิดกล้องเพื่อ${liveAttendanceStatus?.isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`
            : 'ไม่สามารถลงเวลาได้ในขณะนี้'
          : 'กรุณารอสักครู่...'}
      </button>
    ),
    [
      liveAttendanceStatus,
      isActionButtonReady,
      checkInOutAllowance,
      handleAction,
    ],
  );

  const renderStep1 = useMemo(
    () => (
      <div className="flex flex-col h-full">
        <ErrorBoundary>{memoizedUserShiftInfo}</ErrorBoundary>
        <div className="flex-shrink-0 mt-4">
          {memoizedActionButton}
          <p className="text-center mt-2">
            ท่านมีเวลาในการทำรายการ {timeRemaining} วินาที
          </p>
        </div>
      </div>
    ),
    [memoizedUserShiftInfo, memoizedActionButton, timeRemaining],
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

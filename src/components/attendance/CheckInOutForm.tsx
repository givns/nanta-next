//CheckInoutForm.tsx
import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import {
  AttendanceStatusInfo,
  CheckInOutAllowance,
  ShiftData,
  EarlyCheckoutType,
} from '../../types/attendance';
import { UserData } from '../../types/user';
import { useFaceDetection } from '../../hooks/useFaceDetection';
import SkeletonLoader from '../SkeletonLoader';
import UserShiftInfo from '../UserShiftInfo';
import LateReasonModal from '../LateReasonModal';
import ErrorBoundary from '../ErrorBoundary';
import ActionButton from '../ActionButton';
import CameraFrame from '../CameraFrame';
import { closeWindow } from '../../services/liff';
import { formatCheckTime } from '../../utils/timeUtils';

interface CheckInOutFormProps {
  userData: UserData;
  cachedAttendanceStatus: AttendanceStatusInfo | null;
  liveAttendanceStatus: AttendanceStatusInfo | null;
  isCheckingIn: boolean;
  effectiveShift: ShiftData | null;
  isAttendanceLoading: boolean;
  checkInOutAllowance: CheckInOutAllowance | null;
  getCurrentLocation: () => void;
  refreshAttendanceStatus: (forceRefresh: boolean) => Promise<void>;
  onStatusChange: (
    newStatus: boolean,
    photo?: string,
    lateReason?: string,
    isLate?: boolean,
    isOvertime?: boolean,
    isEarlyCheckOut?: boolean,
    earlyCheckoutType?: EarlyCheckoutType,
  ) => Promise<void>;
  onCloseWindow: () => void;
}

// CompletionView Component
const CompletionView: React.FC<{
  isSubmitting: boolean;
  timeRemaining: number;
  currentAttendanceStatus: AttendanceStatusInfo | null;
  isCheckingIn: boolean;
  onClose: () => void;
}> = ({
  isSubmitting,
  timeRemaining,
  currentAttendanceStatus,
  isCheckingIn,
  onClose,
}) => {
  const [autoCloseTimer, setAutoCloseTimer] = useState<NodeJS.Timeout | null>(
    null,
  );

  useEffect(() => {
    if (!isSubmitting && timeRemaining > 0) {
      const timer = setTimeout(() => {
        try {
          onClose();
          closeWindow();
        } catch (error) {
          console.error('Error closing window:', error);
        }
      }, timeRemaining * 1000);

      setAutoCloseTimer(timer);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }
  }, [isSubmitting, timeRemaining, onClose]);

  const getCheckTime = () => {
    const attendance = currentAttendanceStatus?.latestAttendance;
    if (!attendance) return null;

    const time = isCheckingIn
      ? attendance.checkInTime
      : attendance.checkOutTime;
    return time ? formatCheckTime(time) : null;
  };

  const renderStatus = () => {
    if (!currentAttendanceStatus) return null;

    return (
      <div className="px-4 py-2 bg-white shadow-sm rounded-md">
        <div className="text-sm font-medium text-gray-900">
          {isCheckingIn ? 'สถานะการลงเวลาเข้างาน' : 'สถานะการลงเวลาออกงาน'}
        </div>
        {currentAttendanceStatus.detailedStatus === 'late-check-in' && (
          <div className="mt-1 text-sm text-red-600">คุณมาสาย</div>
        )}
      </div>
    );
  };

  if (isSubmitting) {
    return (
      <div className="flex flex-col items-center justify-center p-4">
        <p className="text-lg font-semibold mb-4">ระบบกำลังลงเวลา...</p>
        <SkeletonLoader />
      </div>
    );
  }

  const checkTime = getCheckTime();

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-4">
      <div className="text-center space-y-2">
        <div className="text-lg font-medium">
          {isCheckingIn ? 'ลงเวลาเข้างานเรียบร้อย' : 'ลงเวลาออกงานเรียบร้อย'}
        </div>
        {checkTime && <div className="text-base">เวลา: {checkTime} น.</div>}
      </div>

      {renderStatus()}

      <p className="text-sm text-gray-600">
        ระบบจะปิดอัตโนมัติใน {timeRemaining} วินาที
      </p>
    </div>
  );
};

const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  cachedAttendanceStatus,
  liveAttendanceStatus,
  isCheckingIn,
  effectiveShift,
  isAttendanceLoading,
  checkInOutAllowance,
  getCurrentLocation,
  refreshAttendanceStatus,
  onStatusChange,
  onCloseWindow,
}) => {
  const [step, setStep] = useState<'info' | 'camera' | 'processing'>('info');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState(30);
  const [isActionButtonReady, setIsActionButtonReady] = useState(false);
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);

  const currentAttendanceStatus = useMemo(
    () => liveAttendanceStatus || cachedAttendanceStatus,
    [liveAttendanceStatus, cachedAttendanceStatus],
  );

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    if (checkInOutAllowance !== null) {
      setIsActionButtonReady(true);
    }
  }, [checkInOutAllowance]);

  useEffect(() => {
    if (step === 'info') {
      setTimeRemaining(55);
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

  const resetStates = useCallback(() => {
    setIsSubmitting(false);
    setCapturedPhoto(null);
    setError(null);
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
  }, []);

  const submitCheckInOut = useCallback(
    async (photo: string, lateReason?: string) => {
      try {
        const isLate = checkInOutAllowance?.isLateCheckIn || false;
        const isEarlyCheckOut = checkInOutAllowance?.isEarlyCheckOut || false;
        let earlyCheckoutType: EarlyCheckoutType | undefined;

        if (isEarlyCheckOut) {
          if (checkInOutAllowance?.isPlannedHalfDayLeave) {
            earlyCheckoutType = 'planned';
          } else if (checkInOutAllowance?.isEmergencyLeave) {
            earlyCheckoutType = 'emergency';
          }
        }

        if (isLate && isCheckingIn && !lateReason) {
          setIsLateModalOpen(true);
          return;
        }

        setIsSubmitting(true);
        setStep('processing');

        try {
          await onStatusChange(
            currentAttendanceStatus?.isCheckingIn ?? true,
            photo,
            lateReason || '',
            isLate,
            checkInOutAllowance?.isOvertime || false,
            isEarlyCheckOut,
            earlyCheckoutType,
          );

          // Reset submission timeout on success
          if (submitTimeoutRef.current) {
            clearTimeout(submitTimeoutRef.current);
          }

          // Don't close immediately to show completion state
          setTimeout(() => {
            onCloseWindow();
          }, 2000);
        } catch (error: any) {
          console.error('Status change error:', error);
          throw new Error(
            error.response?.data?.message ||
              error.message ||
              'Failed to update status',
          );
        }
      } catch (error: any) {
        console.error('Error in submitCheckInOut:', error);
        setError(
          error.message || 'An unexpected error occurred. Please try again.',
        );
        setIsSubmitting(false);
        setStep('info');
      }
    },
    [
      checkInOutAllowance,
      isCheckingIn,
      currentAttendanceStatus,
      onStatusChange,
      onCloseWindow,
    ],
  );

  const handlePhotoCapture = useCallback(
    async (photo: string) => {
      if (isSubmitting) return;

      setStep('processing');
      setCapturedPhoto(photo);

      const isLate = checkInOutAllowance?.isLateCheckIn || false;

      if (isLate && isCheckingIn) {
        setIsLateModalOpen(true);
        return;
      }

      try {
        await submitCheckInOut(photo);
      } catch (error) {
        console.error('Error processing photo:', error);
        setError('An error occurred. Please try again.');
        setStep('info');
      }
    },
    [isSubmitting, submitCheckInOut, checkInOutAllowance, isCheckingIn],
  );

  const {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount,
    message,
    resetDetection,
    captureThreshold,
  } = useFaceDetection(5, handlePhotoCapture);

  const handleAction = useCallback(
    async (action: 'checkIn' | 'checkOut') => {
      setError(null);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (!checkInOutAllowance?.allowed) {
        setError(
          checkInOutAllowance?.reason ||
            'Check-in/out is not allowed at this time.',
        );
        return;
      }

      setStep('camera');
    },
    [checkInOutAllowance],
  );

  // Render functions
  const renderStep1 = useMemo(
    () => (
      <div className="h-full flex flex-col">
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          style={{
            height: 'calc(100vh - var(--header-height) - var(--footer-height))',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="px-4 py-2">
            <ErrorBoundary>
              <UserShiftInfo
                userData={userData}
                attendanceStatus={liveAttendanceStatus}
                effectiveShift={effectiveShift}
              />
            </ErrorBoundary>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
          <div className="px-4 pt-3">
            <ActionButton
              isLoading={isAttendanceLoading}
              isActionButtonReady={isActionButtonReady}
              checkInOutAllowance={checkInOutAllowance}
              isCheckingIn={currentAttendanceStatus?.isCheckingIn ?? true}
              isDayOff={currentAttendanceStatus?.isDayOff ?? false}
              onAction={handleAction}
            />

            <div className="mt-2 pb-safe text-center text-sm text-gray-600">
              ท่านมีเวลาในการทำรายการ {timeRemaining} วินาที
            </div>
          </div>
        </div>
      </div>
    ),
    [
      userData,
      liveAttendanceStatus,
      effectiveShift,
      isAttendanceLoading,
      isActionButtonReady,
      checkInOutAllowance,
      currentAttendanceStatus,
      handleAction,
      timeRemaining,
    ],
  );

  const renderStep2 = useCallback(
    () => (
      <div className="fixed inset-0 z-50 bg-black">
        {isModelLoading ? (
          <div className="flex-grow flex flex-col items-center justify-center h-full">
            <SkeletonLoader />
            <p className="mt-4 text-lg text-white">
              กำลังโหลดระบบตรวจจับใบหน้า...
            </p>
          </div>
        ) : (
          <CameraFrame
            webcamRef={webcamRef}
            faceDetected={faceDetected}
            faceDetectionCount={faceDetectionCount}
            message={message}
            captureThreshold={captureThreshold}
          />
        )}
      </div>
    ),
    [
      isModelLoading,
      webcamRef,
      faceDetected,
      faceDetectionCount,
      message,
      captureThreshold,
    ],
  );

  const renderStep3 = useCallback(
    () => (
      <CompletionView
        isSubmitting={isSubmitting}
        timeRemaining={timeRemaining}
        currentAttendanceStatus={currentAttendanceStatus}
        isCheckingIn={isCheckingIn}
        onClose={onCloseWindow}
      />
    ),
    [
      isSubmitting,
      timeRemaining,
      currentAttendanceStatus,
      isCheckingIn,
      onCloseWindow,
    ],
  );

  // Main render
  return (
    <ErrorBoundary>
      <div
        className={`min-h-screen flex-col relative ${
          step === 'camera' ? 'camera-active' : ''
        }`}
      >
        {isSubmitting && (
          <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-[60]">
            <div className="text-center space-y-4">
              <SkeletonLoader />
              <div className="text-black text-lg">กำลังบันทึกข้อมูล...</div>
            </div>
          </div>
        )}

        {/* Different layout for each step */}
        {step === 'camera' ? (
          renderStep2()
        ) : (
          <div className="flex-1 relative">
            {step === 'info' && renderStep1}
            {step === 'processing' && renderStep3()}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-red-50 border-t border-red-100 z-[60]">
            <p className="text-red-500 text-center" role="alert">
              {error}
            </p>
          </div>
        )}

        <LateReasonModal
          isOpen={isLateModalOpen}
          onClose={() => {
            setIsLateModalOpen(false);
            setIsSubmitting(false);
            setCapturedPhoto(null);
          }}
          onSubmit={(lateReason) => {
            if (capturedPhoto) {
              submitCheckInOut(capturedPhoto, lateReason);
            }
            setIsLateModalOpen(false);
          }}
        />
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(CheckInOutForm);

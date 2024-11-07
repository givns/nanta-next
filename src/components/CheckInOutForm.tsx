//CheckInoutForm.tsx
import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import Webcam from 'react-webcam';
import {
  AttendanceStatusInfo,
  CheckInOutAllowance,
  ShiftData,
  EarlyCheckoutType,
} from '../types/attendance';
import { UserData } from '../types/user';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import ErrorBoundary from './ErrorBoundary';
import ActionButton from './ActionButton';
import { getCurrentTime, formatDate } from '../utils/dateUtils';
import { isSameDay, parseISO, subMinutes } from 'date-fns';
import CameraFrame from './CameraFrame';

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
  const currentAttendanceStatus = useMemo(
    () => liveAttendanceStatus || cachedAttendanceStatus,
    [liveAttendanceStatus, cachedAttendanceStatus],
  );
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const submitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);

  useEffect(() => {
    if (checkInOutAllowance !== null) {
      setIsActionButtonReady(true);
    }
  }, [checkInOutAllowance]);

  useEffect(() => {
    if (liveAttendanceStatus) {
      console.log('Received attendanceStatus:', liveAttendanceStatus);
      console.log('isCheckingIn:', liveAttendanceStatus.isCheckingIn);
    }
  }, [liveAttendanceStatus]);

  useEffect(() => {
    if (effectiveShift) {
      console.log('Effective shift:', effectiveShift);
    } else {
      console.log('Effective shift is not available');
    }
  }, [effectiveShift]);

  const resetStates = useCallback(() => {
    setIsSubmitting(false);
    setCapturedPhoto(null);
    setError(null);
    if (submitTimeoutRef.current) {
      clearTimeout(submitTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (isSubmitting) {
      submitTimeoutRef.current = setTimeout(() => {
        console.log('Submission timeout - resetting states');
        resetStates();
      }, 30000);
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
        // Double-check late status (defensive programming)
        if (isLate && isCheckingIn && !lateReason) {
          console.log('Late reason required but missing');
          setIsLateModalOpen(true);
          return;
        }

        setIsSubmitting(true);
        setStep('processing');

        await onStatusChange(
          currentAttendanceStatus?.isCheckingIn ?? true,
          photo,
          lateReason || '',
          isLate,
          checkInOutAllowance?.isOvertime || false,
          isEarlyCheckOut,
          earlyCheckoutType,
        );

        await onCloseWindow();
      } catch (error: any) {
        console.error('Error in submitCheckInOut:', error);
        const errorMessage =
          error.response?.data?.details ||
          error.message ||
          'Failed to submit check-in/out';
        setError(`Error: ${errorMessage}. Please try again.`);
      } finally {
        setIsSubmitting(false);
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

  // Add monitoring for critical state changes
  useEffect(() => {
    console.log('State change monitoring:', {
      step,
      isLateModalOpen,
      hasPhoto: !!capturedPhoto,
      isLate: checkInOutAllowance?.isLateCheckIn,
      isCheckingIn,
    });
  }, [step, isLateModalOpen, capturedPhoto, checkInOutAllowance, isCheckingIn]);

  const createSickLeaveRequest = async (lineUserId: string, date: Date) => {
    const response = await fetch('/api/admin/leaves/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lineUserId,
        leaveType: 'ลาป่วย',
        leaveFormat: 'ลาเต็มวัน',
        reason: 'ลาป่วยฉุกเฉิน',
        startDate: formatDate(date),
        endDate: formatDate(date),
        fullDayCount: 1,
        resubmitted: false,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create sick leave request');
    }

    return response.json();
  };

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

  const handleEmergencyLeave = async (now: Date) => {
    try {
      setIsLoading(true);
      if (userData?.lineUserId) {
        await createSickLeaveRequest(userData.lineUserId, now);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Emergency leave request creation failed:', error);
      setError('การสร้างใบลาป่วยล้มเหลว กรุณาติดต่อฝ่ายบุคคล');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckIn = () => {
    setStep('camera');
  };

  const handleCheckOut = async () => {
    if (!effectiveShift) {
      console.error('Effective shift is not available');
      setError('Unable to process check-out. Shift information is missing.');
      return;
    }

    const now = getCurrentTime();
    const { approved, hasApprovedLeave } =
      await validateCheckOutConditions(now);
    if (!approved) return;

    // Handle early checkout cases
    if (checkInOutAllowance?.isEarlyCheckOut) {
      // Case 1: Pre-approved half-day leave
      if (checkInOutAllowance.isPlannedHalfDayLeave) {
        setStep('camera');
        return;
      }

      // Case 2: Emergency leave (before midshift)
      if (checkInOutAllowance.isEmergencyLeave && !hasApprovedLeave) {
        // Single confirmation point for emergency leave
        if (!isConfirmedEarlyCheckout) {
          const confirmed = window.confirm(
            'คุณกำลังจะลงเวลาออกก่อนเวลาเที่ยง ระบบจะทำการยื่นคำขอลาป่วยเต็มวันให้อัตโนมัติ ต้องการดำเนินการต่อหรือไม่?',
          );
          if (!confirmed) return;
          setIsConfirmedEarlyCheckout(true);
        }

        const leaveCreated = await handleEmergencyLeave(now);
        if (!leaveCreated) return;
      }

      // Case 3: Regular early checkout (after midshift)
      if (checkInOutAllowance.isAfterMidshift) {
        setError('ไม่สามารถลงเวลาออกก่อนเวลาเลิกงานได้ กรุณาติดต่อฝ่ายบุคคล');
        return;
      }
    }

    setStep('camera');
  };

  // Update handleAction to handle both cases consistently
  const handleAction = useCallback(
    async (action: 'checkIn' | 'checkOut') => {
      console.log('handleAction details:', {
        action,
        checkInOutAllowance,
        currentStep: step,
      });

      // Clear timers
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Validate conditions
      if (!checkInOutAllowance?.allowed) {
        setError(
          checkInOutAllowance?.reason ||
            'Check-in/out is not allowed at this time.',
        );
        return;
      }

      try {
        if (action === 'checkIn') {
          handleCheckIn();
        } else {
          await handleCheckOut();
        }
      } catch (error) {
        console.error('Error in handleAction:', error);
        setError('An unexpected error occurred. Please try again.');
      }
    },
    [checkInOutAllowance, handleCheckIn, handleCheckOut],
  );

  useEffect(() => {
    if (step === 'camera') {
      console.log('Camera step entered');
      setIsInitialized(true);
      resetDetection();
    }
    return () => {
      if (step !== 'camera') {
        setIsInitialized(false);
      }
    };
  }, [step, resetDetection]);

  useEffect(() => {
    if (step === 'camera') {
      // Hide guide after 5 seconds
      const timer = setTimeout(() => setShowGuide(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const validateCheckOutConditions = async (now: Date) => {
    // Calculate shift times
    const shiftTimes = calculateShiftTimes(now);

    // Check for half-day leave
    const approvedHalfDayLeave = liveAttendanceStatus?.leaveRequests?.find(
      (leave) =>
        leave.status === 'Approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(parseISO(leave.startDate), now),
    );

    return {
      shiftTimes,
      approved: true,
      hasApprovedLeave: !!approvedHalfDayLeave,
    };
  };

  const calculateShiftTimes = (now: Date) => {
    const shiftStart = new Date(now);
    const shiftEnd = new Date(now);

    shiftStart.setHours(parseInt(effectiveShift!.startTime.split(':')[0], 10));
    shiftStart.setMinutes(
      parseInt(effectiveShift!.startTime.split(':')[1], 10),
    );

    shiftEnd.setHours(parseInt(effectiveShift!.endTime.split(':')[0], 10));
    shiftEnd.setMinutes(parseInt(effectiveShift!.endTime.split(':')[1], 10));

    const midpoint = new Date((shiftStart.getTime() + shiftEnd.getTime()) / 2);

    return { shiftStart, shiftEnd, midpoint };
  };

  const memoizedUserShiftInfo = useMemo(
    () => (
      <UserShiftInfo
        userData={userData}
        attendanceStatus={liveAttendanceStatus}
        effectiveShift={effectiveShift}
      />
    ),
    [userData, liveAttendanceStatus, effectiveShift],
  );

  const memoizedActionButton = useMemo(
    () => (
      <ActionButton
        isLoading={isAttendanceLoading}
        isActionButtonReady={isActionButtonReady}
        checkInOutAllowance={checkInOutAllowance}
        isCheckingIn={currentAttendanceStatus?.isCheckingIn ?? true}
        isDayOff={currentAttendanceStatus?.isDayOff ?? false}
        onAction={handleAction}
      />
    ),
    [
      isAttendanceLoading,
      isActionButtonReady,
      checkInOutAllowance,
      currentAttendanceStatus,
      handleAction,
    ],
  );

  // CheckInOutForm.tsx
  const renderStep1 = useMemo(
    () => (
      <div className="h-full flex flex-col">
        {/* Scrollable content area */}
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

        {/* Fixed footer with action button */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
          <div className="px-4 pt-3">
            {/* Status alerts */}
            {checkInOutAllowance?.reason && !checkInOutAllowance.allowed && (
              <div className="mb-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
                {checkInOutAllowance.reason}
              </div>
            )}

            {/* Action button */}
            <ActionButton
              isLoading={isAttendanceLoading}
              isActionButtonReady={isActionButtonReady}
              checkInOutAllowance={checkInOutAllowance}
              isCheckingIn={currentAttendanceStatus?.isCheckingIn ?? true}
              isDayOff={currentAttendanceStatus?.isDayOff ?? false}
              onAction={handleAction}
            />

            {/* Countdown - always visible above safe area */}
            <div className="mt-2 pb-safe text-center text-sm text-gray-600">
              ท่านมีเวลาในการทำรายการ {timeRemaining} วินาที
            </div>
          </div>
        </div>
      </div>
    ),
    [memoizedUserShiftInfo, memoizedActionButton, timeRemaining],
  );

  const renderStep2 = () => (
    // Take full height of the main content area, accounting for header
    <div className="absolute inset-0" style={{ top: 'var(--header-height)' }}>
      <div className="h-full relative">
        {isModelLoading ? (
          <div className="flex-grow flex flex-col items-center justify-center h-full">
            <SkeletonLoader />
            <p className="mt-4 text-lg">กำลังโหลดระบบตรวจจับใบหน้า...</p>
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

  // Update main content structure
  const content = (
    <ErrorBoundary>
      <div className="min-h-screen flex flex-col relative">
        {isSubmitting && (
          <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
            <div className="text-black text-lg">กำลังบันทึกข้อมูล...</div>
          </div>
        )}

        {/* Different layout for camera step */}
        {step === 'camera' ? (
          // Camera takes full viewport minus header
          <div className="flex-1 relative">{renderStep2()}</div>
        ) : (
          // Normal layout for other steps
          <div className="flex-1 relative">
            {step === 'info' && renderStep1}
            {step === 'processing' && renderStep3()}
          </div>
        )}

        {/* Errors */}
        {error && (
          <div className="fixed bottom-0 left-0 right-0 px-4 py-3 bg-red-50 border-t border-red-100 z-20">
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

  return content;
};

export default React.memo(CheckInOutForm);

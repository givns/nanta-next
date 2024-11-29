//CheckInoutForm.tsx
import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { UserData } from '@/types/user';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { FaceDetectionService } from '@/services/EnhancedFaceDetection';
import SkeletonLoader from '../SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from '../LateReasonModal';
import ErrorBoundary from '../ErrorBoundary';
import ActionButton from './ActionButton';
import { formatDate, getCurrentTime } from '@/utils/dateUtils';
import { format, isSameDay, parseISO } from 'date-fns';
import CameraFrame from '../CameraFrame';
import { closeWindow } from '@/services/liff';
import {
  AttendanceStatusInfo,
  CheckInOutAllowance,
  EarlyCheckoutType,
  ShiftData,
} from '@/types/attendance';

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
  onStatusChange: (params: StatusChangeParams) => Promise<void>;
  onCloseWindow: () => void;
}

interface StatusChangeParams {
  isCheckingIn: boolean;
  photo: string;
  lateReason?: string;
  isLate?: boolean;
  isOvertime?: boolean;
  isEarlyCheckOut?: boolean;
  earlyCheckoutType?: EarlyCheckoutType;
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
  const [loadingState, setLoadingState] = useState<{
    status: 'idle' | 'loading' | 'submitting' | 'success' | 'error';
    message: string;
  }>({
    status: 'idle',
    message: '',
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);
  const submitTimeout = useRef<NodeJS.Timeout>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (checkInOutAllowance !== null) {
      setIsActionButtonReady(true);
    }
  }, [checkInOutAllowance]);

  useEffect(() => {
    if (liveAttendanceStatus) {
      console.log('Received attendanceStatus:', liveAttendanceStatus);
      console.log(
        'State Monitoring: isCheckingIn:',
        liveAttendanceStatus.isCheckingIn,
      );
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
      submitTimeout.current = setTimeout(() => {
        setError('Request took too long. Please check your attendance status.');
        setIsSubmitting(false);
      }, 32000); // Slightly longer than API timeout
    }

    return () => {
      if (submitTimeout.current) {
        clearTimeout(submitTimeout.current);
      }
    };
  }, [isSubmitting, resetStates]);

  const submitCheckInOut = useCallback(
    async (photo: string, lateReason?: string) => {
      if (isSubmitting) return;

      try {
        setIsSubmitting(true);
        setStep('processing');
        setLoadingState({
          status: 'submitting',
          message: 'กำลังประมวลผลการลงเวลา...',
        });
        setError(null);

        const isLate = checkInOutAllowance?.flags.isLateCheckIn || false;
        const isEarlyCheckOut =
          checkInOutAllowance?.flags.isEarlyCheckOut || false;
        let earlyCheckoutType: EarlyCheckoutType | undefined;

        if (isEarlyCheckOut) {
          if (checkInOutAllowance?.flags.isPlannedHalfDayLeave) {
            earlyCheckoutType = 'planned';
          } else if (checkInOutAllowance?.flags.isEmergencyLeave) {
            earlyCheckoutType = 'emergency';
          }
        }

        if (isLate && isCheckingIn && !lateReason) {
          setIsLateModalOpen(true);
          return;
        }

        // Initiate API call and get the promise
        const apiCall = onStatusChange({
          isCheckingIn: currentAttendanceStatus?.isCheckingIn ?? true,
          photo,
          lateReason: lateReason || '',
          isLate,
          isOvertime: checkInOutAllowance?.flags.isOvertime || false,
          isEarlyCheckOut,
          earlyCheckoutType,
        });

        // Set up a 500ms timer
        const timer = new Promise((resolve) => setTimeout(resolve, 500));

        try {
          // Wait for either the API call to start sending or 500ms
          // Using .catch here to handle API errors but continue execution
          await Promise.race([
            apiCall.catch((error) => {
              console.error('Initial API error:', error);
              // Return a resolved promise to continue execution
              return Promise.resolve();
            }),
            timer,
          ]);

          // At this point, either the API has started or we've waited 500ms
          closeWindow();

          // Let the API call complete in the background
          apiCall.catch((error) => {
            console.error('Background API error:', error);
          });
        } catch (error) {
          // This catch block should never be hit due to error handling above,
          // but keeping it as a safety measure
          console.error('Error during API initiation:', error);
          closeWindow(); // Still close the window
        }
      } catch (error: any) {
        // Handle setup errors (before API call)
        console.error('Setup error:', error);
        closeWindow();
      }
    },
    [
      checkInOutAllowance,
      isCheckingIn,
      currentAttendanceStatus,
      onStatusChange,
      isSubmitting,
    ],
  );

  const handlePhotoCapture = useCallback(
    async (photo: string) => {
      console.log('Photo captured, proceeding with submission');
      if (isSubmitting) {
        console.log('Already submitting, skipping');
        return;
      }

      // Stop camera/detection immediately
      setStep('processing');
      setCapturedPhoto(photo);

      const isLate = checkInOutAllowance?.flags.isLateCheckIn || false;
      const isRegularCheckInOut =
        checkInOutAllowance?.periodType === 'regular' &&
        !checkInOutAllowance?.flags.isOvertime;

      // Handle late check-in case
      if (isLate && isCheckingIn && isRegularCheckInOut) {
        console.log('Late check-in detected, showing modal');
        setIsLateModalOpen(true);
        return;
      }

      try {
        console.log('Processing regular check-in/out');
        await submitCheckInOut(photo);
      } catch (error) {
        console.error('Error processing photo:', error);
        setError('An error occurred. Please try again.');
        setStep('info'); // Reset to info step on error
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
      isLate: checkInOutAllowance?.flags.isLateCheckIn,
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
    if (checkInOutAllowance?.flags.isEarlyCheckOut) {
      // Case 1: Pre-approved half-day leave
      if (checkInOutAllowance.flags.isPlannedHalfDayLeave) {
        setStep('camera');
        return;
      }

      // Case 2: Emergency leave (before midshift)
      if (checkInOutAllowance.flags.isEmergencyLeave && !hasApprovedLeave) {
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

      // Clear any existing errors
      setError(null);

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
      } catch (error: any) {
        console.error('Error in handleAction:', {
          error,
          message: error.message,
          stack: error.stack,
        });

        setError(
          error.message || 'An unexpected error occurred. Please try again.',
        );

        // Reset to initial state on error
        setStep('info');
      }
    },
    [checkInOutAllowance, handleCheckIn, handleCheckOut],
  );

  useEffect(() => {
    // Cleanup function for webcam
    const cleanupWebcam = () => {
      if (webcamRef.current?.stream) {
        const tracks = webcamRef.current.stream.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };

    // If we're moving away from camera step, cleanup
    if (step !== 'camera') {
      cleanupWebcam();
    }

    // Cleanup on component unmount
    return () => {
      cleanupWebcam();
    };
  }, [step]);

  // Update step change effect
  useEffect(() => {
    if (step === 'camera') {
      console.log('Camera step entered');
      setIsInitialized(true);
      resetDetection();
    } else {
      setIsInitialized(false);
    }
  }, [step, resetDetection]);

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
        isLoading={loadingState.status === 'loading'}
      />
    ),
    [userData, liveAttendanceStatus, effectiveShift, loadingState.status],
  );

  // Add effect to monitor shift availability
  useEffect(() => {
    if (effectiveShift?.id) {
      console.log('Effective shift loaded:', effectiveShift);
      setIsActionButtonReady(true);
    } else {
      console.log('Waiting for shift data...');
      setIsActionButtonReady(false);
    }
  }, [effectiveShift]);

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

  useEffect(() => {
    if (isAttendanceLoading) {
      setLoadingState({
        status: 'loading',
        message: 'กำลังตรวจสอบข้อมูลการลงเวลา...',
      });
    } else {
      setLoadingState({
        status: 'idle',
        message: '',
      });
    }
  }, [isAttendanceLoading]);

  const renderProcessingView = () => (
    <div className="flex flex-col items-center justify-center p-4">
      {loadingState.status === 'submitting' && (
        <>
          <SkeletonLoader />
          <p className="text-lg font-semibold mt-4">
            {loadingState.message || 'กำลังประมวลผล...'}
          </p>
        </>
      )}

      {loadingState.status === 'success' && (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4">
            <svg
              className="w-full h-full text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold">{loadingState.message}</p>
          <p className="text-sm text-gray-500 mt-2">กำลังปิดหน้าต่าง...</p>
        </div>
      )}

      {loadingState.status === 'error' && (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4">
            <svg
              className="w-full h-full text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-red-600">
            {loadingState.message}
          </p>
          <button
            onClick={() => {
              setLoadingState({ status: 'idle', message: '' });
              setStep('camera');
            }}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    switch (step) {
      case 'info':
        return (
          <div className="h-full flex flex-col">
            <>{memoizedUserShiftInfo}</>
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
              <div className="px-4 py-3 pb-safe">{memoizedActionButton}</div>
            </div>
          </div>
        );

      case 'camera':
        return (
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
        );

      case 'processing':
        return renderProcessingView();
    }
  };

  return (
    <ErrorBoundary>
      <div
        className={`min-h-screen flex flex-col relative ${step === 'camera' ? 'camera-active' : ''}`}
      >
        {renderContent()}
        <LateReasonModal
          isOpen={isLateModalOpen}
          onClose={() => {
            setIsLateModalOpen(false);
            setLoadingState({ status: 'idle', message: '' });
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

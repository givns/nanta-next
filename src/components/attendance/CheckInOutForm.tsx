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
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from '../LateReasonModal';
import ErrorBoundary from '../ErrorBoundary';
import ActionButton from './ActionButton';
import { getCurrentTime, formatDate } from '../../utils/dateUtils';
import { format, isSameDay, parseISO, subMinutes } from 'date-fns';
import CameraFrame from '../CameraFrame';
import { th } from 'date-fns/locale/th';
import { closeWindow } from '@/services/liff';

// Add this type for better error handling
interface ApiError {
  error: string;
  message?: string;
  details?: string;
}

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
  const [loadingState, setLoadingState] = useState<{
    status: 'idle' | 'loading' | 'submitting' | 'error';
    message: string;
  }>({
    status: 'idle',
    message: '',
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
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
        // Show success state briefly before closing
        setLoadingState({
          status: 'idle',
          message: 'ลงเวลาสำเร็จ',
        });

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
        setError(null);

        // Set a client-side timeout for the entire operation
        const timeoutPromise = new Promise((_, reject) => {
          submitTimeoutRef.current = setTimeout(() => {
            reject(new Error('Request took too long. Please try again.'));
          }, 20000); // 20 second timeout
        });

        // Race between the actual submission and timeout
        const result = await Promise.race([
          onStatusChange(
            currentAttendanceStatus?.isCheckingIn ?? true,
            photo,
            lateReason || '',
            isLate,
            checkInOutAllowance?.isOvertime || false,
            isEarlyCheckOut,
            earlyCheckoutType,
          ),
          timeoutPromise,
        ]);

        // Clear timeout if successful
        if (submitTimeoutRef.current) {
          clearTimeout(submitTimeoutRef.current);
        }

        // Show success state briefly before closing
        setLoadingState({
          status: 'idle',
          message: 'ลงเวลาสำเร็จ',
        });

        // Show success state briefly before closing
        setTimeout(() => {
          closeWindow();
        }, 2000);
      } catch (error: any) {
        console.error('Status change error:', error);

        // Clear any existing timeout
        if (submitTimeoutRef.current) {
          clearTimeout(submitTimeoutRef.current);
        }

        // Handle different types of errors
        let errorMessage = 'Failed to update status. Please try again.';

        if (
          error.message.includes('timeout') ||
          error.message.includes('too long')
        ) {
          errorMessage =
            'Request took too long. Please check your attendance status and try again if needed.';

          // After timeout error, try to refresh status
          try {
            await refreshAttendanceStatus(true);
          } catch (refreshError) {
            console.error(
              'Error refreshing status after timeout:',
              refreshError,
            );
          }
        } else if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        setError(errorMessage);
        setStep('info');
        setIsSubmitting(false);

        // Show error state for a moment before retrying
        setTimeout(() => {
          setError(null);
        }, 5000);
      }
    },
    [
      checkInOutAllowance,
      isCheckingIn,
      currentAttendanceStatus,
      onStatusChange,
      isSubmitting,
      refreshAttendanceStatus,
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

      const isLate = checkInOutAllowance?.isLateCheckIn || false;

      // Handle late check-in case
      if (isLate && isCheckingIn) {
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

  // TimeEntry display component
  const TimeEntryInfo: React.FC<{
    checkTime: string | null;
    isCheckingIn: boolean;
    isLate?: boolean;
  }> = ({ checkTime, isCheckingIn, isLate }) => {
    if (!checkTime) return null;

    return (
      <div className="text-center space-y-2">
        <div className="text-lg font-medium">
          {isCheckingIn ? 'ลงเวลาเข้างานเรียบร้อย' : 'ลงเวลาออกงานเรียบร้อย'}
        </div>
        <div className="text-base">
          เวลา:{' '}
          {format(new Date(`2000-01-01T${checkTime}`), 'HH:mm น.', {
            locale: th,
          })}
        </div>
        {isLate && <div className="text-red-500 text-sm">มาสาย</div>}
      </div>
    );
  };

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
    [userData, liveAttendanceStatus, effectiveShift],
  );

  const memoizedActionButton = useMemo(
    () => (
      <ActionButton
        isLoading={isAttendanceLoading}
        loadingMessage={loadingState.message}
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

  const renderContent = () => {
    switch (step) {
      case 'info':
        return (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto">
              <UserShiftInfo
                userData={userData}
                attendanceStatus={liveAttendanceStatus}
                effectiveShift={effectiveShift}
                isLoading={loadingState.status === 'loading'}
              />
            </div>
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
              <div className="px-4 pt-3">
                <ActionButton
                  isLoading={loadingState.status !== 'idle'}
                  loadingMessage={loadingState.message}
                  isActionButtonReady={isActionButtonReady}
                  checkInOutAllowance={checkInOutAllowance}
                  isCheckingIn={currentAttendanceStatus?.isCheckingIn ?? true}
                  isDayOff={currentAttendanceStatus?.isDayOff ?? false}
                  onAction={handleAction}
                />
              </div>
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
        return (
          <div className="flex flex-col items-center justify-center p-4">
            <SkeletonLoader />
            <p className="text-lg font-semibold mt-4">
              {loadingState.message || 'กำลังประมวลผล...'}
            </p>
            {loadingState.status === 'error' && (
              <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-md text-center">
                <p>{loadingState.message}</p>
                <button
                  onClick={() => setStep('info')}
                  className="mt-2 text-sm text-red-500 hover:text-red-700"
                >
                  ลองใหม่อีกครั้ง
                </button>
              </div>
            )}
          </div>
        );
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

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
} from '../types/attendance';
import { UserData } from '../types/user';
import { useFaceDetection } from '../hooks/useFaceDetection';
import SkeletonLoader from './SkeletonLoader';
import UserShiftInfo from './UserShiftInfo';
import LateReasonModal from './LateReasonModal';
import ErrorBoundary from './ErrorBoundary';
import ActionButton from './ActionButton';
import { getCurrentTime, formatDate } from '../utils/dateUtils';
import { isSameDay, parseISO } from 'date-fns';

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
        setIsSubmitting(true);
        setStep('processing');

        // Check if it's a late check-in
        const isLate = checkInOutAllowance?.isLate || false;
        const isOvertime = checkInOutAllowance?.isOvertime || false;

        if (isLate && !lateReason) {
          setIsLateModalOpen(true);
          setIsSubmitting(false);
          return;
        }

        await onStatusChange(
          liveAttendanceStatus?.isCheckingIn ?? true,
          photo,
          lateReason,
          isLate,
          isOvertime,
        );

        await onCloseWindow();
      } catch (error: any) {
        console.error(`Error in submitCheckInOut: ${error.message}`);
        setError('Failed to submit check-in/out. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      liveAttendanceStatus,
      userData,
      checkInOutAllowance,
      onStatusChange,
      onCloseWindow,
    ],
  );

  const handlePhotoCapture = useCallback(
    async (photo: string) => {
      if (isSubmitting) return;
      setCapturedPhoto(photo);
      try {
        await submitCheckInOut(photo);
      } catch (error) {
        console.error('Error processing photo:', error);
        setError('An error occurred. Please try again.');
      }
    },
    [isSubmitting, submitCheckInOut],
  );

  const {
    webcamRef,
    isModelLoading,
    faceDetectionCount,
    message,
    resetDetection,
    captureThreshold,
  } = useFaceDetection(5, handlePhotoCapture);

  const confirmEarlyCheckOut = useCallback(async () => {
    if (!effectiveShift || !userData || !liveAttendanceStatus) return true;

    const now = getCurrentTime();
    const shiftStart = new Date(now);
    const shiftEnd = new Date(now);

    shiftStart.setHours(parseInt(effectiveShift.startTime.split(':')[0], 10));
    shiftStart.setMinutes(parseInt(effectiveShift.startTime.split(':')[1], 10));

    shiftEnd.setHours(parseInt(effectiveShift.endTime.split(':')[0], 10));
    shiftEnd.setMinutes(parseInt(effectiveShift.endTime.split(':')[1], 10));

    // Calculate shift midpoint
    const shiftMidpoint = new Date(
      (shiftStart.getTime() + shiftEnd.getTime()) / 2,
    );

    // Check for approved half-day leave
    const approvedHalfDayLeave = liveAttendanceStatus.leaveRequests?.find(
      (leave) =>
        leave.status === 'Approved' &&
        leave.leaveFormat === 'ลาครึ่งวัน' &&
        isSameDay(parseISO(leave.startDate), now),
    );

    if (approvedHalfDayLeave) {
      const leaveStartTime = parseISO(approvedHalfDayLeave.startDate);
      const isMorningLeave = leaveStartTime < shiftMidpoint;

      if (
        (isMorningLeave && now >= shiftMidpoint) ||
        (!isMorningLeave && now >= shiftStart)
      ) {
        // Allow check-out without confirmation for approved half-day leave
        return true;
      }
    }

    if (now < shiftEnd) {
      const confirmed = window.confirm(
        'คุณกำลังจะลงเวลาออกก่อนเวลาเลิกงาน หากคุณต้องการลาป่วยฉุกเฉิน ระบบจะทำการยื่นคำขอลาป่วยเต็มวันให้อัตโนมัติ ต้องการดำเนินการต่อหรือไม่?',
      );

      if (confirmed) {
        try {
          setIsLoading(true);
          if (userData && userData.lineUserId) {
            // Check if userData and userData.lineUserId are not null
            await createSickLeaveRequest(userData.lineUserId, now);
            alert('คำขอลาป่วยถูกส่งเรียบร้อยแล้ว');
            return true;
          } else {
            throw new Error('Invalid user data');
          }
        } catch (error) {
          console.error('Error creating sick leave request:', error);
          alert('เกิดข้อผิดพลาดในการส่งคำขอลาป่วย กรุณาติดต่อ HR');
          return false;
        } finally {
          setIsLoading(false);
        }
      } else {
        return false;
      }
    }
    return true;
  }, [effectiveShift, userData, liveAttendanceStatus]);

  const createSickLeaveRequest = async (lineUserId: string, date: Date) => {
    const response = await fetch('/api/leave-requests', {
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
    (action: 'checkIn' | 'checkOut') => {
      console.log('handleAction called with:', action);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      try {
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
    [confirmEarlyCheckOut, checkInOutAllowance, resetDetection],
  );

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
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-4 border-blue-500 rounded-full w-48 h-48"></div>
            </div>
          </div>
          <p className="text-center mb-2">{message}</p>
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
            if (capturedPhoto) {
              submitCheckInOut(capturedPhoto, lateReason);
            }
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

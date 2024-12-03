// components/attendance/CheckInOutForm.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserData } from '@/types/user';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { getCurrentTime, formatDate } from '@/utils/dateUtils';
import { UserShiftInfo } from './UserShiftInfo';
import { ActionButton } from './ActionButton';
import CameraFrame from './CameraFrame';
import LateReasonModal from './LateReasonModal';
import { closeWindow } from '@/services/liff';
import { format, isSameDay, parseISO } from 'date-fns';

interface CheckInOutFormProps {
  userData: UserData;
  onComplete?: () => void;
}

type FormStep = 'info' | 'camera' | 'processing';

interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

export const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  onComplete = closeWindow,
}) => {
  // States
  const [step, setStep] = useState<FormStep>('info');
  const [error, setError] = useState<string | null>(null);
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    message: '',
  });

  // Timeouts
  const timerRef = useRef<NodeJS.Timeout>();
  const [timeRemaining, setTimeRemaining] = useState(55);

  // Main attendance hook
  const {
    state,
    checkStatus,
    currentPeriod,
    effectiveShift,
    validation,
    locationState,
    locationReady,
    isLoading,
    error: attendanceError,
    checkInOut,
    refreshAttendanceStatus,
    getCurrentLocation,
  } = useSimpleAttendance({
    employeeId: userData.employeeId,
    lineUserId: userData.lineUserId,
  });

  // Face detection setup
  const {
    webcamRef,
    isModelLoading,
    faceDetected,
    faceDetectionCount,
    message: detectionMessage,
    resetDetection,
    captureThreshold,
  } = useFaceDetection(5, handlePhotoCapture);

  // Initialize timer
  useEffect(() => {
    if (step === 'info') {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            onComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [step, onComplete]);

  // Create sick leave request
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

  const handleEmergencyLeave = async (now: Date) => {
    try {
      setProcessingState((prev) => ({ ...prev, status: 'loading' }));
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
      setProcessingState((prev) => ({ ...prev, status: 'idle' }));
    }
  };

  const calculateShiftTimes = (now: Date) => {
    if (!effectiveShift) return null;

    const shiftStart = new Date(now);
    const shiftEnd = new Date(now);

    shiftStart.setHours(parseInt(effectiveShift.startTime.split(':')[0], 10));
    shiftStart.setMinutes(parseInt(effectiveShift.startTime.split(':')[1], 10));

    shiftEnd.setHours(parseInt(effectiveShift.endTime.split(':')[0], 10));
    shiftEnd.setMinutes(parseInt(effectiveShift.endTime.split(':')[1], 10));

    const midpoint = new Date((shiftStart.getTime() + shiftEnd.getTime()) / 2);

    return { shiftStart, shiftEnd, midpoint };
  };

  const validateCheckOutConditions = async (now: Date) => {
    const shiftTimes = calculateShiftTimes(now);
    if (!shiftTimes) return { approved: false, hasApprovedLeave: false };

    // Check for half-day leave
    const approvedHalfDayLeave = validation?.flags.isPlannedHalfDayLeave;

    return {
      approved: true,
      hasApprovedLeave: !!approvedHalfDayLeave,
    };
  };

  const handleCheckOut = async () => {
    if (!effectiveShift) {
      setError('Unable to process check-out. Shift information is missing.');
      return;
    }

    const now = getCurrentTime();
    const { approved, hasApprovedLeave } =
      await validateCheckOutConditions(now);
    if (!approved) return;

    // Handle early checkout cases
    if (validation?.flags.isEarlyCheckOut) {
      // Case 1: Pre-approved half-day leave
      if (validation.flags.isPlannedHalfDayLeave) {
        setStep('camera');
        return;
      }

      // Case 2: Emergency leave (before midshift)
      if (validation.flags.isEmergencyLeave && !hasApprovedLeave) {
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

  // Handle photo capture
  async function handlePhotoCapture(photo: string) {
    if (processingState.status === 'loading') return;

    try {
      setStep('processing');
      setProcessingState({
        status: 'loading',
        message: 'กำลังประมวลผลการลงเวลา...',
      });

      const isCheckingIn = !currentPeriod?.checkInTime;
      const isLate = validation?.flags.isLateCheckIn;

      // Handle late check-in
      if (isCheckingIn && isLate && !validation?.flags.isOvertime) {
        setIsLateModalOpen(true);
        return;
      }

      await handleAttendanceSubmit(photo);
    } catch (error) {
      setProcessingState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'เกิดข้อผิดพลาดในการบันทึกเวลา',
      });
      setStep('info');
    }
  }

  // Handle attendance submission
  const handleAttendanceSubmit = async (photo: string, lateReason?: string) => {
    try {
      await checkInOut({
        photo,
        checkTime: getCurrentTime().toISOString(),
        isCheckIn: !currentPeriod?.checkInTime,
        lateReason,
        isOvertime: currentPeriod?.type === 'overtime',
        overtimeId: currentPeriod?.overtimeId,
        earlyCheckoutType: validation?.flags.isPlannedHalfDayLeave
          ? 'planned'
          : validation?.flags.isEmergencyLeave
            ? 'emergency'
            : undefined,
      });

      setProcessingState({
        status: 'success',
        message: 'บันทึกเวลาสำเร็จ',
      });

      // Delay before closing
      setTimeout(onComplete, 1500);
    } catch (error) {
      throw error;
    }
  };

  // Handle action button click
  const handleAction = useCallback(
    async (action: 'checkIn' | 'checkOut') => {
      setError(null);

      if (!validation?.allowed) {
        setError(
          validation?.reason || 'Check-in/out is not allowed at this time.',
        );
        return;
      }

      try {
        if (action === 'checkIn') {
          setStep('camera');
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
        setStep('info');
      }
    },
    [validation, handleCheckOut],
  );

  // Render processing view
  const renderProcessingView = () => (
    <ProcessingView
      status={processingState.status}
      message={processingState.message}
      onRetry={() => setStep('info')}
    />
  );

  // Render camera view
  const renderCameraView = () => (
    <div className="fixed inset-0 z-50 bg-black">
      {isModelLoading ? (
        <div className="flex-grow flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <p className="mt-4 text-lg text-white">
            กำลังโหลดระบบตรวจจับใบหน้า...
          </p>
        </div>
      ) : (
        <CameraFrame
          webcamRef={webcamRef}
          faceDetected={faceDetected}
          faceDetectionCount={faceDetectionCount}
          message={detectionMessage}
          captureThreshold={captureThreshold}
        />
      )}
    </div>
  );

  // Error display
  if (error || attendanceError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error || attendanceError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div
      className={`min-h-screen flex flex-col relative ${step === 'camera' ? 'camera-active' : ''}`}
    >
      {step === 'info' && (
        <div className="h-full flex flex-col">
          <UserShiftInfo
            userData={userData}
            status={{
              state,
              checkStatus,
              currentPeriod,
              isHoliday: effectiveShift?.isHoliday || false,
              isDayOff: effectiveShift?.isDayOff || false,
              isOvertime: currentPeriod?.type === 'overtime',
            }}
            effectiveShift={effectiveShift}
            isLoading={isLoading}
          />

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-10">
            <div className="px-4 py-3 pb-safe">
              <ActionButton
                isEnabled={!!validation?.allowed}
                isLoading={isLoading}
                checkInOutAllowance={validation}
                currentPeriod={currentPeriod}
                onAction={handleAction}
                locationReady={locationReady}
              />
            </div>
          </div>
        </div>
      )}

      {step === 'camera' && renderCameraView()}
      {step === 'processing' && renderProcessingView()}

      <LateReasonModal
        isOpen={isLateModalOpen}
        onClose={() => setIsLateModalOpen(false)}
        onSubmit={async (reason) => {
          setIsLateModalOpen(false);
          await handleAttendanceSubmit(
            webcamRef.current?.getScreenshot() || '',
            reason,
          );
        }}
      />
    </div>
  );
};

export default CheckInOutForm;

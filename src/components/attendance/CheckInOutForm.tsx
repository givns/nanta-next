import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserData } from '@/types/user';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { useFaceDetection } from '@/hooks/useFaceDetection';
import { formatDate, getCurrentTime } from '@/utils/dateUtils';
import { UserShiftInfo } from './UserShiftInfo';
import { ActionButton } from './ActionButton';
import CameraFrame from './CameraFrame';
import LateReasonModal from './LateReasonModal';
import { closeWindow } from '@/services/liff';
import {
  CurrentPeriodInfo,
  PeriodType,
  AttendanceBaseResponse,
} from '@/types/attendance';

interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

// Update UserShiftInfoStatus to match AttendanceBaseResponse
interface UserShiftInfoStatus
  extends Omit<AttendanceBaseResponse, 'latestAttendance'> {
  currentPeriod: CurrentPeriodInfo | null;
  isHoliday: boolean;
  isDayOff: boolean;
  isOvertime: boolean;
  latestAttendance?: {
    regularCheckInTime?: Date;
    regularCheckOutTime?: Date;
    overtimeCheckInTime?: Date;
    overtimeCheckOutTime?: Date;
    isLateCheckIn?: boolean;
    isOvertime?: boolean;
  };
}

interface CheckInOutFormProps {
  userData: UserData;
  onComplete?: () => void;
}

export const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  onComplete = closeWindow,
}) => {
  // Core states
  const [step, setStep] = useState<'info' | 'camera' | 'processing'>('info');
  const [error, setError] = useState<string | null>(null);
  const [cameraInitialized, setCameraInitialized] = useState(false);
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    message: '',
  });

  // Refs
  const timerRef = useRef<NodeJS.Timeout>();

  // Main attendance hook
  const {
    state,
    checkStatus,
    currentPeriod,
    effectiveShift,
    validation,
    locationState,
    isLoading,
    error: attendanceError,
    checkInOut,
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
    captureThreshold,
  } = useFaceDetection(5, handlePhotoCapture);

  // Timer effect
  useEffect(() => {
    let timeRemaining = 55;

    if (step === 'info') {
      timerRef.current = setInterval(() => {
        timeRemaining -= 1;
        if (timeRemaining <= 0) {
          onComplete();
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [step, onComplete]);

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

  // Emergency leave handling
  const createSickLeaveRequest = useCallback(
    async (lineUserId: string, date: Date) => {
      try {
        setProcessingState((prev) => ({ ...prev, status: 'loading' }));
        const response = await fetch('/api/admin/leaves/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      } catch (error) {
        console.error('Emergency leave request creation failed:', error);
        setError('การสร้างใบลาป่วยล้มเหลว กรุณาติดต่อฝ่ายบุคคล');
        return false;
      } finally {
        setProcessingState((prev) => ({ ...prev, status: 'idle' }));
      }
    },
    [],
  );

  // Handle attendance submission
  const handleAttendanceSubmit = async (photo: string, lateReason?: string) => {
    const mappedConfidence: 'high' | 'medium' | 'low' =
      locationState.confidence === 'manual' ? 'low' : locationState.confidence;

    await checkInOut({
      photo,
      checkTime: getCurrentTime().toISOString(),
      isCheckIn: !currentPeriod?.checkInTime,
      reason: lateReason,
      address: locationState.address,
      isOvertime: currentPeriod?.type === 'overtime',
      earlyCheckoutType: validation?.flags.isPlannedHalfDayLeave
        ? 'planned'
        : validation?.flags.isEmergencyLeave
          ? 'emergency'
          : undefined,
      entryType: currentPeriod?.type || PeriodType.REGULAR,
      confidence: mappedConfidence,
      isLate: validation?.flags.isLateCheckIn,
      metadata: {
        overtimeId: currentPeriod?.overtimeId,
      },
      employeeId: '',
      lineUserId: null,
    });

    setProcessingState({
      status: 'success',
      message: 'บันทึกเวลาสำเร็จ',
    });

    setTimeout(onComplete, 1500);
  };

  // Handle check out
  const handleCheckOut = useCallback(async () => {
    if (!effectiveShift) {
      setError('Unable to process check-out. Shift information is missing.');
      return;
    }

    const now = getCurrentTime();

    // Handle early checkout cases
    if (validation?.flags.isEarlyCheckOut) {
      // Case 1: Pre-approved half-day leave
      if (validation.flags.isPlannedHalfDayLeave) {
        setStep('camera');
        return;
      }

      // Case 2: Emergency leave (before midshift)
      if (validation.flags.isEmergencyLeave) {
        if (!isConfirmedEarlyCheckout) {
          const confirmed = window.confirm(
            'คุณกำลังจะลงเวลาออกก่อนเวลาเที่ยง ระบบจะทำการยื่นคำขอลาป่วยเต็มวันให้อัตโนมัติ ต้องการดำเนินการต่อหรือไม่?',
          );
          if (!confirmed) return;
          setIsConfirmedEarlyCheckout(true);
        }

        if (userData?.lineUserId) {
          const leaveCreated = await createSickLeaveRequest(
            userData.lineUserId,
            now,
          );
          if (!leaveCreated) return;
        }
      }
    }

    setStep('camera');
  }, [
    effectiveShift,
    validation?.flags,
    isConfirmedEarlyCheckout,
    userData?.lineUserId,
    createSickLeaveRequest,
  ]);

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

  if (error || attendanceError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error || attendanceError}</AlertDescription>
      </Alert>
    );
  }

  const renderProcessingView = () => (
    <div className="flex flex-col items-center justify-center p-4">
      {processingState.status === 'loading' && (
        <>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-4 text-lg">{processingState.message}</p>
        </>
      )}

      {processingState.status === 'success' && (
        <div className="text-center">
          <div className="text-green-500 mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <p className="text-lg font-semibold">{processingState.message}</p>
        </div>
      )}

      {processingState.status === 'error' && (
        <div className="text-center">
          <div className="text-red-500 mx-auto mb-4">
            <AlertCircle size={32} />
          </div>
          <p className="text-lg font-semibold text-red-600">
            {processingState.message}
          </p>
          <button
            onClick={() => setStep('info')}
            className="mt-4 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark"
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      )}
    </div>
  );

  const renderCameraView = () => (
    <div className="fixed inset-0 z-50 bg-black">
      {isModelLoading ? (
        <div className="flex-grow flex flex-col items-center justify-center h-full">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-6 text-xl text-white">
            กำลังโหลดระบบตรวจจับใบหน้า...
          </p>
          <button
            onClick={() => setStep('info')}
            className="mt-8 px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-full hover:bg-white/30 transition-all"
          >
            ย้อนกลับ
          </button>
        </div>
      ) : (
        <div className="relative h-full">
          <CameraFrame
            webcamRef={webcamRef}
            faceDetected={faceDetected}
            faceDetectionCount={faceDetectionCount}
            message={detectionMessage}
            captureThreshold={captureThreshold}
          />
          <button
            onClick={() => setStep('info')}
            className="absolute top-6 left-6 p-3 bg-black/30 text-white rounded-full hover:bg-black/40 transition-all"
          >
            ย้อนกลับ
          </button>
        </div>
      )}
    </div>
  );

  const userShiftInfoStatus: UserShiftInfoStatus = {
    state,
    checkStatus,
    currentPeriod,
    isCheckingIn: !currentPeriod?.checkInTime,
    isHoliday:
      currentPeriod?.type === PeriodType.REGULAR &&
      effectiveShift?.workDays?.includes(getCurrentTime().getDay()) === false,
    isDayOff:
      currentPeriod?.type === PeriodType.REGULAR &&
      effectiveShift?.workDays?.includes(getCurrentTime().getDay()) === false,
    isOvertime: currentPeriod?.type === 'overtime',
    latestAttendance: {
      regularCheckInTime: currentPeriod?.checkInTime
        ? new Date(currentPeriod.checkInTime)
        : undefined,
      regularCheckOutTime: currentPeriod?.checkOutTime
        ? new Date(currentPeriod.checkOutTime)
        : undefined,
      isLateCheckIn: validation?.flags?.isLateCheckIn || false,
      isOvertime: currentPeriod?.type === 'overtime' || false,
      overtimeCheckInTime: undefined,
      overtimeCheckOutTime: undefined,
    },
  };

  return (
    <div className="min-h-screen flex flex-col bg-white pb-24">
      {' '}
      {/* Added pb-24 for button space */} {/* Added bg-white */}
      {step === 'info' && (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <UserShiftInfo
              userData={userData}
              status={userShiftInfoStatus}
              effectiveShift={effectiveShift}
              isLoading={isLoading}
            />
          </div>

          <div className="fixed bottom-0 right-0 left-0 z-20">
            <div className="container max-w-md mx-auto px-4 pb-safe">
              <ActionButton
                isEnabled={!!validation?.allowed}
                validationMessage={validation?.reason}
                nextWindowTime={
                  currentPeriod?.type === 'overtime' && !validation?.allowed
                    ? new Date(currentPeriod.current.start)
                    : undefined
                }
                isCheckingIn={!currentPeriod?.checkInTime}
                onAction={() =>
                  handleAction(
                    !currentPeriod?.checkInTime ? 'checkIn' : 'checkOut',
                  )
                }
                locationState={{
                  isReady: locationState.status === 'ready',
                  error: locationState.error || undefined,
                }}
              />
            </div>
          </div>
        </div>
      )}
      {/* Use absolute positioning for overlay views */}
      {step === 'camera' && (
        <div className="absolute inset-0 z-50">{renderCameraView()}</div>
      )}
      {step === 'processing' && (
        <div className="absolute inset-0 z-50 bg-white">
          {renderProcessingView()}
        </div>
      )}
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

export default React.memo(CheckInOutForm);

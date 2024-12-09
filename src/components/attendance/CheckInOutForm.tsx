import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserData } from '@/types/user';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { formatDate, getCurrentTime } from '@/utils/dateUtils';
import { ActionButton } from './ActionButton';
import LateReasonModal from './LateReasonModal';
import { closeWindow } from '@/services/liff';
import { PeriodType, ATTENDANCE_CONSTANTS } from '@/types/attendance';
import MobileAttendanceApp from './MobileAttendanceApp';
import { endOfDay, format, parseISO, startOfDay, subMinutes } from 'date-fns';

interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

interface CheckInOutFormProps {
  userData: UserData;
  onComplete?: () => void;
}

export const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  onComplete = closeWindow,
}) => {
  const [step, setStep] = useState<'info' | 'processing'>('info');
  const [error, setError] = useState<string | null>(null);
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    message: '',
  });

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
    overtimeContext,
    isHoliday,
    isDayOff,
    refreshAttendanceStatus,
    base,
  } = useSimpleAttendance({
    employeeId: userData.employeeId,
    lineUserId: userData.lineUserId || '',
  });

  // Timer effect
  useEffect(() => {
    let timeRemaining = 55;

    if (step === 'info') {
      const timerRef = setInterval(() => {
        timeRemaining -= 1;
        if (timeRemaining <= 0) {
          onComplete();
        }
      }, 1000);

      return () => {
        clearInterval(timerRef);
      };
    }
  }, [step, onComplete]);

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
  const handleAttendanceSubmit = async (overtimeParams?: {
    isOvertime: boolean;
    overtimeRequestId?: string;
  }) => {
    try {
      setProcessingState({
        status: 'loading',
        message: 'กำลังบันทึกเวลา...',
      });

      const mappedConfidence: 'high' | 'medium' | 'low' | 'manual' =
        locationState.confidence;

      const isCheckingIn = !currentPeriod?.checkInTime;

      await checkInOut({
        // Required fields
        employeeId: userData.employeeId,
        lineUserId: userData.lineUserId || null,
        checkTime: '',
        isCheckIn: isCheckingIn,
        address: locationState.address,
        inPremises: locationState.inPremises,
        confidence: mappedConfidence,
        entryType: currentPeriod?.type || PeriodType.REGULAR,

        // Optional fields
        photo: '',
        reason: undefined,
        isOvertime:
          overtimeParams?.isOvertime || currentPeriod?.type === 'overtime',
        isManualEntry: false,
        overtimeRequestId:
          overtimeParams?.overtimeRequestId ||
          (currentPeriod?.type === 'overtime'
            ? currentPeriod.overtimeId
            : undefined),
        earlyCheckoutType: validation?.flags.isPlannedHalfDayLeave
          ? 'planned'
          : validation?.flags.isEmergencyLeave
            ? 'emergency'
            : undefined,
        isLate: validation?.flags.isLateCheckIn,

        // Location data if available
        location: locationState.coordinates,

        // Metadata
        metadata: {
          overtimeId: currentPeriod?.overtimeId,
          isDayOffOvertime: validation?.flags.isDayOffOvertime,
          isInsideShiftHours: validation?.flags.isInsideShift,
        },
      });

      // Add explicit refresh
      await refreshAttendanceStatus();

      // Wait a moment for state to update
      await new Promise((resolve) => setTimeout(resolve, 500));

      setProcessingState({
        status: 'success',
        message: 'บันทึกเวลาสำเร็จ',
      });

      setTimeout(onComplete, 2000);
    } catch (error) {
      console.error('Attendance submission error:', error);
      setProcessingState({
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'เกิดข้อผิดพลาดในการบันทึกเวลา',
      });
    }
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
        setStep('processing');
        await handleAttendanceSubmit();
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

    setStep('processing');
    await handleAttendanceSubmit();
  }, [
    effectiveShift,
    validation?.flags,
    isConfirmedEarlyCheckout,
    userData?.lineUserId,
    createSickLeaveRequest,
    handleAttendanceSubmit,
  ]);

  // Handle action button click
  const handleAction = useCallback(
    async (action: 'checkIn' | 'checkOut' | 'startOvertime') => {
      setError(null);

      if (!validation?.allowed) {
        setError(
          validation?.reason || 'Check-in/out is not allowed at this time.',
        );
        return;
      }

      try {
        if (action === 'checkIn') {
          setStep('processing');
          await handleAttendanceSubmit();
        } else if (action === 'checkOut') {
          await handleCheckOut();
        } else if (action === 'startOvertime') {
          // Handle starting overtime
          if (!currentPeriod || currentPeriod.type !== 'overtime') {
            setError('Cannot start overtime at this time.');
            return;
          }

          setStep('processing');
          await handleAttendanceSubmit({
            isOvertime: true,
            overtimeRequestId: currentPeriod.overtimeId,
          });
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
    [validation, handleCheckOut, handleAttendanceSubmit, currentPeriod],
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

  const now = getCurrentTime();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {step === 'info' && (
        <>
          {/* Main content area */}
          <div className="flex-1 overflow-y-auto pb-32">
            <MobileAttendanceApp
              userData={{
                name: userData.name,
                employeeId: userData.employeeId,
                departmentName: userData.departmentName || '',
              }}
              shiftData={effectiveShift}
              currentPeriod={
                currentPeriod || {
                  type: PeriodType.REGULAR,
                  isComplete: false,
                  current: {
                    start: startOfDay(now).toISOString(),
                    end: endOfDay(now).toISOString(),
                  },
                }
              }
              status={{
                isHoliday: isHoliday,
                isDayOff: isDayOff,
              }}
              attendanceStatus={{
                state: base.state,
                checkStatus: base.checkStatus,
                isCheckingIn: base.isCheckingIn,
                latestAttendance: base.latestAttendance
                  ? {
                      id: base.latestAttendance.id || '', // Provide fallback for required fields
                      employeeId: userData.employeeId,
                      date: getCurrentTime().toISOString(),
                      regularCheckInTime:
                        base.latestAttendance.regularCheckInTime,
                      regularCheckOutTime:
                        base.latestAttendance.regularCheckOutTime,
                      state: base.state,
                      checkStatus: base.checkStatus,
                      overtimeState: base.latestAttendance.overtimeState,
                      isManualEntry:
                        base.latestAttendance.isManualEntry ?? false,
                      isDayOff: base.latestAttendance.isDayOff ?? false,
                      shiftStartTime:
                        base.latestAttendance.shiftStartTime ??
                        effectiveShift?.startTime,
                      shiftEndTime:
                        base.latestAttendance.shiftEndTime ??
                        effectiveShift?.endTime,
                    }
                  : null,
              }}
              overtimeInfo={
                overtimeContext
                  ? {
                      id: overtimeContext.id,
                      startTime: overtimeContext.startTime,
                      endTime: overtimeContext.endTime,
                      durationMinutes: overtimeContext.durationMinutes,
                      isInsideShiftHours: overtimeContext.isInsideShiftHours,
                      isDayOffOvertime: overtimeContext.isDayOffOvertime,
                      reason: overtimeContext.reason,
                    }
                  : null
              }
              locationState={{
                isReady: locationState.status === 'ready',
                error: locationState.error || undefined,
              }}
              onAction={() =>
                handleAction(base.isCheckingIn ? 'checkIn' : 'checkOut')
              }
            />
          </div>

          {/* Single ActionButton */}
          {/* Single ActionButton */}
          <ActionButton
            isEnabled={!!validation?.allowed}
            validationMessage={validation?.reason}
            nextWindowTime={
              !validation?.allowed && currentPeriod
                ? currentPeriod.type === 'overtime' && overtimeContext
                  ? subMinutes(
                      parseISO(
                        `${format(new Date(), 'yyyy-MM-dd')}T${overtimeContext.startTime}`,
                      ),
                      ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
                    )
                  : currentPeriod.type === 'regular' && effectiveShift
                    ? subMinutes(
                        parseISO(
                          `${format(new Date(), 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
                        ),
                        ATTENDANCE_CONSTANTS.EARLY_CHECK_IN_THRESHOLD,
                      )
                    : undefined
                : undefined
            }
            isCheckingIn={
              currentPeriod?.type === 'regular' && !base.isCheckingIn
            }
            isCheckingOut={
              currentPeriod?.type === 'regular' && base.isCheckingIn
            }
            isStartingOvertime={
              currentPeriod?.type === 'overtime' && !base.isCheckingIn
            }
            onAction={() => {
              if (currentPeriod?.type === 'regular') {
                handleAction(base.isCheckingIn ? 'checkOut' : 'checkIn');
              } else if (currentPeriod?.type === 'overtime') {
                handleAction('startOvertime');
              }
            }}
            locationState={{
              isReady: locationState.status === 'ready',
              error: locationState.error || undefined,
            }}
          />
        </>
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
          await handleAttendanceSubmit();
        }}
      />
    </div>
  );
};
export default React.memo(CheckInOutForm);

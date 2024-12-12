import React, { useState, useCallback, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserData } from '@/types/user';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { formatDate, getCurrentTime } from '@/utils/dateUtils';
import { AttendanceActionButton } from './ActionButton';
import LateReasonModal from './LateReasonModal';
import { closeWindow } from '@/services/liff';
import {
  PeriodType,
  ATTENDANCE_CONSTANTS,
  ShiftData,
  CurrentPeriodInfo,
} from '@/types/attendance';
import MobileAttendanceApp from './MobileAttendanceApp';
import {
  addDays,
  addMinutes,
  endOfDay,
  format,
  parseISO,
  startOfDay,
} from 'date-fns';
import { OvertimeContext } from '@/types/attendance/overtime';
import SliderUnlock from './SliderUnlock';

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
  const [earlyCheckoutSliderActive, setEarlyCheckoutSliderActive] =
    useState(false);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    message: '',
  });

  const {
    currentPeriod,
    effectiveShift,
    validation,
    locationState,
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

  // Memoized values
  const isCheckingIn = !currentPeriod?.checkInTime;
  const now = getCurrentTime();

  const nextWindowTime = React.useMemo(() => {
    if (!validation?.allowed && currentPeriod) {
      if (currentPeriod.type === 'overtime' && overtimeContext) {
        return new Date(overtimeContext.endTime);
      }
      if (currentPeriod.type === 'regular' && effectiveShift) {
        return getNextWindowStartTime(effectiveShift);
      }
      return new Date(currentPeriod.current.end);
    }
    return undefined;
  }, [validation, currentPeriod, overtimeContext, effectiveShift]);

  const isEarlyAction = React.useMemo(() => {
    if (!nextWindowTime || !currentPeriod) return false;
    return getCurrentTime() < nextWindowTime;
  }, [nextWindowTime, currentPeriod]);

  const isLateAction = React.useMemo(() => {
    if (!currentPeriod?.checkInTime || !effectiveShift) return false;
    const shiftStart = parseISO(
      `${format(getCurrentTime(), 'yyyy-MM-dd')}T${effectiveShift.startTime}`,
    );
    return (
      getCurrentTime() >
      addMinutes(shiftStart, ATTENDANCE_CONSTANTS.LATE_CHECK_IN_THRESHOLD)
    );
  }, [currentPeriod, effectiveShift]);

  const handleAttendanceSubmit = useCallback(
    async (overtimeParams?: {
      isOvertime: boolean;
      overtimeRequestId?: string;
      reason?: string;
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
          employeeId: userData.employeeId,
          lineUserId: userData.lineUserId || null,
          checkTime: '',
          isCheckIn: isCheckingIn,
          address: locationState.address,
          inPremises: locationState.inPremises,
          confidence: mappedConfidence,
          entryType: currentPeriod?.type || PeriodType.REGULAR,
          photo: '',
          reason: overtimeParams?.reason,
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
          location: locationState.coordinates,
          metadata: {
            overtimeId: currentPeriod?.overtimeId,
            isDayOffOvertime: validation?.flags.isDayOffOvertime,
            isInsideShiftHours: validation?.flags.isInsideShift,
          },
        });

        await refreshAttendanceStatus();
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
    },
    [
      currentPeriod,
      locationState,
      userData,
      validation,
      checkInOut,
      refreshAttendanceStatus,
      onComplete,
    ],
  );

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

  const handleCheckOut = useCallback(async () => {
    if (!effectiveShift) {
      setError('Unable to process check-out. Shift information is missing.');
      return;
    }

    if (validation?.flags.isEarlyCheckOut) {
      if (validation.flags.isPlannedHalfDayLeave) {
        setStep('processing');
        await handleAttendanceSubmit();
        return;
      }

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
    now,
    createSickLeaveRequest,
    handleAttendanceSubmit,
  ]);

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
        console.error('Error in handleAction:', error);
        setError(
          error.message || 'An unexpected error occurred. Please try again.',
        );
        setStep('info');
      }
    },
    [validation, handleCheckOut, handleAttendanceSubmit, currentPeriod],
  );

  const getConfirmationMessage = useCallback(
    (
      period: CurrentPeriodInfo | null,
      overtime: OvertimeContext | null,
    ): string => {
      if (!period) return 'Confirm action?';

      if (period.type === 'overtime') {
        return `Confirm ${isCheckingIn ? 'check-in to' : 'check-out from'} overtime period?`;
      }

      if (overtime && !isCheckingIn) {
        return 'Complete regular shift and start overtime?';
      }

      return `Confirm ${isCheckingIn ? 'check-in' : 'check-out'}?`;
    },
    [isCheckingIn],
  );

  const handlePeriodTransition = useCallback(async () => {
    if (currentPeriod?.type === 'regular' && overtimeContext) {
      await handleAction('startOvertime');
    }
  }, [currentPeriod, overtimeContext, handleAction]);

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

  const renderSliderUnlock = () => {
    if (
      !isCheckingIn &&
      validation?.flags.isEarlyCheckOut &&
      validation.flags.isEmergencyLeave &&
      earlyCheckoutSliderActive
    ) {
      return (
        <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
          <SliderUnlock
            onUnlock={async () => {
              try {
                setStep('processing');

                if (userData?.lineUserId) {
                  const leaveCreated = await createSickLeaveRequest(
                    userData.lineUserId,
                    now,
                  );
                  if (!leaveCreated) {
                    setEarlyCheckoutSliderActive(false);
                    return;
                  }
                }

                await handleAttendanceSubmit();
                setEarlyCheckoutSliderActive(false);
              } catch (error) {
                console.error('Early checkout error:', error);
                setStep('info');
                setEarlyCheckoutSliderActive(false);
              }
            }}
            onCancel={() => setEarlyCheckoutSliderActive(false)}
            lockedMessage="Slide to confirm early checkout"
            unlockedMessage="Release to create sick leave"
            isEnabled={validation?.allowed}
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {step === 'info' && (
        <>
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
                isHoliday,
                isDayOff,
              }}
              attendanceStatus={{
                state: base.state,
                checkStatus: base.checkStatus,
                isCheckingIn: base.isCheckingIn,
                latestAttendance: base.latestAttendance
                  ? {
                      id: base.latestAttendance.id || '',
                      employeeId: userData.employeeId,
                      date: getCurrentTime().toISOString(),
                      CheckInTime: base.latestAttendance.CheckInTime,
                      CheckOutTime: base.latestAttendance.CheckOutTime,
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

          <AttendanceActionButton
            action={{
              type: isCheckingIn ? 'check-in' : 'check-out',
              period: {
                type: currentPeriod?.type || 'regular',
                transition: overtimeContext
                  ? {
                      to: 'overtime',
                      at: parseISO(
                        `${format(getCurrentTime(), 'yyyy-MM-dd')}T${overtimeContext.startTime}`,
                      ),
                    }
                  : undefined,
              },
              timing: nextWindowTime
                ? {
                    plannedTime: nextWindowTime,
                    isEarly: isEarlyAction,
                    isLate: isLateAction,
                  }
                : undefined,
            }}
            validation={{
              canProceed: !!validation?.allowed,
              message: validation?.reason,
              requireConfirmation: validation?.flags?.requireConfirmation,
              confirmationMessage: getConfirmationMessage(
                currentPeriod,
                overtimeContext,
              ),
            }}
            systemState={{
              isReady: locationState.status === 'ready',
              locationValid: locationState.status === 'ready',
              error: locationState.error || undefined,
            }}
            onActionTriggered={() => {
              if (
                validation?.flags.isEarlyCheckOut &&
                validation?.flags.isEmergencyLeave
              ) {
                setEarlyCheckoutSliderActive(true);
              } else {
                if (currentPeriod?.type === 'regular') {
                  handleAction(isCheckingIn ? 'checkIn' : 'checkOut');
                } else if (currentPeriod?.type === 'overtime') {
                  handleAction('startOvertime');
                }
              }
            }}
            onTransitionInitiated={handlePeriodTransition}
          />

          {renderSliderUnlock()}
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

function getNextWindowStartTime(shiftData: ShiftData): Date | null {
  const now = getCurrentTime();
  const regularShiftStartTime = parseISO(
    `${format(now, 'yyyy-MM-dd')}T${shiftData.startTime}`,
  );
  const regularShiftEndTime = parseISO(
    `${format(now, 'yyyy-MM-dd')}T${shiftData.endTime}`,
  );

  if (now >= regularShiftEndTime) {
    return parseISO(
      `${format(addDays(now, 1), 'yyyy-MM-dd')}T${shiftData.startTime}`,
    );
  } else if (now < regularShiftStartTime) {
    return regularShiftStartTime;
  } else {
    return regularShiftEndTime;
  }
}

export default React.memo(CheckInOutForm);

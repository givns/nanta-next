import React, { useState, useCallback, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserData } from '@/types/user';
import { useSimpleAttendance } from '@/hooks/useSimpleAttendance';
import { formatDate, getCurrentTime } from '@/utils/dateUtils';
import { ActionButton } from './ActionButton';
import LateReasonModal from './LateReasonModal';
import { closeWindow } from '@/services/liff';
import { PeriodType } from '@prisma/client';
import {
  StateValidation,
  UnifiedPeriodState,
  OvertimeContext,
} from '@/types/attendance';
import MobileAttendanceApp from './MobileAttendanceApp';
import SliderUnlock from './SliderUnlock';
import { parseISO } from 'date-fns';

interface ProcessingState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

interface CheckInOutFormProps {
  userData: UserData;
  onComplete?: () => void;
}

interface AttendanceSubmitParams {
  isOvertime: boolean;
  overtimeId?: string;
  reason?: string;
}

export const CheckInOutForm: React.FC<CheckInOutFormProps> = ({
  userData,
  onComplete = closeWindow,
}) => {
  // State management
  const [step, setStep] = useState<'info' | 'processing'>('info');
  const [error, setError] = useState<string | null>(null);
  const [isLateModalOpen, setIsLateModalOpen] = useState(false);
  const [isConfirmedEarlyCheckout, setIsConfirmedEarlyCheckout] =
    useState(false);
  const [processingState, setProcessingState] = useState<ProcessingState>({
    status: 'idle',
    message: '',
  });

  // Get attendance data
  const {
    periodState,
    shift,
    stateValidation,
    locationState,
    error: attendanceError,
    checkInOut,
    context,
    isHoliday,
    isDayOff,
    refreshAttendanceStatus,
    base: attendanceBase,
  } = useSimpleAttendance({
    employeeId: userData.employeeId,
    lineUserId: userData.lineUserId || '',
  });

  const now = getCurrentTime();

  const handleAttendanceSubmit = useCallback(
    async (params?: AttendanceSubmitParams) => {
      try {
        setProcessingState({
          status: 'loading',
          message: 'กำลังบันทึกเวลา...',
        });

        const isCheckingIn = !periodState?.activity.checkIn;

        await checkInOut({
          // Required fields
          employeeId: userData.employeeId,
          lineUserId: userData.lineUserId || null,
          checkTime: now.toISOString(),
          isCheckIn: isCheckingIn,
          address: locationState.address,
          inPremises: locationState.inPremises,
          confidence: locationState.confidence,
          periodType: periodState?.type || PeriodType.REGULAR,

          // Optional fields
          reason: params?.reason,
          isOvertime:
            params?.isOvertime || periodState?.type === PeriodType.OVERTIME,
          overtimeId: params?.overtimeId || periodState?.activity.overtimeId,
          isManualEntry: false,

          // Location data
          ...(locationState.coordinates && {
            location: {
              coordinates: locationState.coordinates,
              address: locationState.address,
            },
          }),

          // Metadata
          metadata: {
            source: 'system',
            ...(stateValidation?.flags?.isEmergencyLeave && {
              earlyCheckoutType: 'emergency' as const,
            }),
            ...(stateValidation?.flags?.isLateCheckIn && {
              isLate: true,
            }),
          },
        });

        await refreshAttendanceStatus();

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
        setStep('info');
      }
    },
    [
      periodState,
      locationState,
      userData,
      now,
      checkInOut,
      refreshAttendanceStatus,
      onComplete,
      stateValidation?.flags,
    ],
  );

  const createSickLeaveRequest = useCallback(
    async (lineUserId: string, date: Date): Promise<boolean> => {
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

        return true;
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

  const handleAction = useCallback(async () => {
    setError(null);

    if (!stateValidation?.allowed) {
      setError(stateValidation?.reason || 'ไม่สามารถลงเวลาได้ในขณะนี้');
      return;
    }

    try {
      if (stateValidation.flags.isEmergencyLeave && !isConfirmedEarlyCheckout) {
        const confirmed = window.confirm(
          'คุณกำลังจะลงเวลาออกก่อนเวลาเที่ยง ระบบจะทำการยื่นคำขอลาป่วยเต็มวันให้อัตโนมัติ ต้องการดำเนินการต่อหรือไม่?',
        );
        if (!confirmed) return;
        setIsConfirmedEarlyCheckout(true);
      }

      if (stateValidation.flags.isEmergencyLeave && userData?.lineUserId) {
        const leaveCreated = await createSickLeaveRequest(
          userData.lineUserId,
          now,
        );
        if (!leaveCreated) return;
      }

      setStep('processing');
      await handleAttendanceSubmit();
    } catch (error) {
      console.error('Action error:', error);
      setError(
        error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการลงเวลา',
      );
      setStep('info');
    }
  }, [
    stateValidation,
    isConfirmedEarlyCheckout,
    userData?.lineUserId,
    now,
    createSickLeaveRequest,
    handleAttendanceSubmit,
  ]);

  const handlePeriodTransition = useCallback(async () => {
    if (
      periodState?.type === PeriodType.REGULAR &&
      context.nextPeriod?.overtimeInfo
    ) {
      try {
        setStep('processing');
        await handleAttendanceSubmit({
          isOvertime: true,
          overtimeId: context.nextPeriod.overtimeInfo.id,
        });
      } catch (error) {
        console.error('Period transition error:', error);
        setStep('info');
      }
    }
  }, [periodState, context.nextPeriod, handleAttendanceSubmit]);

  const getConfirmationMessage = (
    state: UnifiedPeriodState,
    overtime: OvertimeContext | null,
    validation: StateValidation,
  ): string => {
    if (validation.flags.isEmergencyLeave) {
      return 'คุณกำลังจะลงเวลาออกก่อนเวลา และจะมีการยื่นใบลาป่วยอัตโนมัติ ต้องการดำเนินการต่อหรือไม่?';
    }

    if (overtime && overtime.validationWindow) {
      const now = getCurrentTime();
      if (now < overtime.validationWindow.earliestCheckIn) {
        return 'ยังไม่ถึงเวลาเริ่มทำงานล่วงเวลา ต้องการดำเนินการต่อหรือไม่?';
      }
      if (now > overtime.validationWindow.latestCheckOut) {
        return 'เลยเวลาทำงานล่วงเวลาแล้ว ต้องการดำเนินการต่อหรือไม่?';
      }
    }

    return !state.activity.checkIn
      ? 'ยืนยันการลงเวลาเข้างาน?'
      : 'ยืนยันการลงเวลาออกงาน?';
  };

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

  const renderActionComponent = () => {
    if (
      periodState.activity.checkIn && // User is checked in
      periodState.type === PeriodType.REGULAR &&
      stateValidation.flags.isEarlyCheckOut && // Early checkout
      stateValidation.flags.isEmergencyLeave // Emergency leave
    ) {
      return (
        <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
          <SliderUnlock
            onUnlock={async () => {
              try {
                setStep('processing');
                if (userData.lineUserId) {
                  const leaveCreated = await createSickLeaveRequest(
                    userData.lineUserId,
                    now,
                  );
                  if (!leaveCreated) return;
                }
                await handleAttendanceSubmit();
              } catch (error) {
                console.error('Early checkout error:', error);
                setStep('info');
              }
            }}
            validation={{
              canProceed: stateValidation.allowed,
              message: stateValidation.reason,
            }}
            isEnabled={locationState.status === 'ready'}
          />
        </div>
      );
    }

    return (
      <ActionButton
        attendanceStatus={{
          state: attendanceBase.state,
          checkStatus: attendanceBase.checkStatus,
          isOvertime: periodState.activity.isOvertime,
          overtimeState: attendanceBase.periodInfo.overtimeState,
        }}
        periodType={periodState.type}
        periodWindow={periodState.timeWindow}
        validation={{
          canProceed: stateValidation.allowed,
          message: stateValidation.reason,
          requireConfirmation:
            stateValidation.flags.requiresAutoCompletion ||
            stateValidation.flags.hasPendingTransition,
          confirmationMessage: getConfirmationMessage(
            periodState,
            context.nextPeriod?.overtimeInfo || null,
            stateValidation,
          ),
        }}
        systemState={{
          isReady: locationState.status === 'ready',
          locationValid: locationState.status === 'ready',
          error: locationState.error || undefined,
        }}
        transition={
          context.transition
            ? {
                targetType: context.transition.to.type,
                availableAt: context.transition.to.start
                  ? parseISO(context.transition.to.start)
                  : null,
              }
            : undefined
        }
        onActionTriggered={handleAction}
        onTransitionRequested={
          stateValidation.flags.hasPendingTransition
            ? handlePeriodTransition
            : undefined
        }
      />
    );
  };

  // Auto-close timer
  useEffect(() => {
    if (step === 'info') {
      const timer = setTimeout(onComplete, 55000);
      return () => clearTimeout(timer);
    }
  }, [step, onComplete]);

  // Error handling render
  if (error || attendanceError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error || attendanceError}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {step === 'info' && (
        <>
          <div className="flex-1 overflow-y-auto pb-32">
            <MobileAttendanceApp
              userData={userData}
              shiftData={shift} // use shift instead of effectiveShift
              currentPeriod={periodState}
              status={{
                isHoliday,
                isDayOff,
              }}
              attendanceStatus={attendanceBase}
              overtimeInfo={context.nextPeriod?.overtimeInfo} // get overtime info from context
              validation={{
                allowed: stateValidation.allowed,
                reason: stateValidation.reason,
                flags: {
                  isCheckingIn: !periodState.activity.checkIn,
                  isLateCheckIn: stateValidation.flags.isLateCheckIn,
                  isEarlyCheckOut: stateValidation.flags.isEarlyCheckOut,
                  isPlannedHalfDayLeave:
                    stateValidation.flags.isPlannedHalfDayLeave,
                  isEmergencyLeave: stateValidation.flags.isEmergencyLeave,
                  isOvertime: stateValidation.flags.isOvertime,
                  requireConfirmation:
                    stateValidation.flags.requiresAutoCompletion ||
                    stateValidation.flags.hasPendingTransition,
                  isDayOffOvertime: stateValidation.flags.isDayOffOvertime,
                  isInsideShift: stateValidation.flags.isInsideShift,
                  isAutoCheckIn: stateValidation.flags.isAutoCheckIn,
                  isAutoCheckOut: stateValidation.flags.isAutoCheckOut,
                },
                metadata: {
                  missingEntries: [],
                  transitionWindow: context.transition
                    ? {
                        start: context.transition.to.start || '',
                        end: periodState.timeWindow.end,
                        targetPeriod: context.transition.to.type,
                      }
                    : undefined,
                },
              }}
              locationState={{
                isReady: locationState.status === 'ready',
                error: locationState.error || undefined,
              }}
              onAction={handleAction}
            />
          </div>

          {renderActionComponent()}
        </>
      )}

      {step === 'processing' && renderProcessingView()}

      <LateReasonModal
        isOpen={isLateModalOpen}
        onClose={() => setIsLateModalOpen(false)}
        onSubmit={async (reason: string) => {
          setIsLateModalOpen(false);
          await handleAttendanceSubmit({
            reason,
            isOvertime: false,
          });
        }}
      />
    </div>
  );
};

export default React.memo(CheckInOutForm);

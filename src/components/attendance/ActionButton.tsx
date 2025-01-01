import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import React from 'react';
import { AlertCircle } from 'lucide-react';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { formatSafeTime } from '@/shared/timeUtils';

interface ActionButtonProps {
  attendanceStatus: {
    state: AttendanceState;
    checkStatus: CheckStatus;
    isOvertime: boolean;
    overtimeState?: OvertimeState;
  };
  periodType: PeriodType;
  periodWindow?: {
    start: string;
    end: string;
  };
  validation: {
    canProceed: boolean;
    message?: string;
    requireConfirmation?: boolean;
    confirmationMessage?: string;
  };
  systemState: {
    isReady: boolean;
    locationValid: boolean;
    error?: string;
  };
  transition?: {
    targetType: PeriodType;
    availableAt: Date | null; // Change to allow null since context.transition.to.start can be null
  };
  onActionTriggered: () => void;
  onTransitionRequested?: () => void;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  attendanceStatus,
  periodType,
  periodWindow,
  validation,
  systemState,
  transition,
  onActionTriggered,
  onTransitionRequested,
}) => {
  // Is checking in if not currently checked in
  const isCheckingIn = attendanceStatus.checkStatus !== CheckStatus.CHECKED_IN;

  const buttonLabel = React.useMemo(() => {
    if (!systemState.isReady) return '...';
    if (!systemState.locationValid) return '!';

    if (isCheckingIn) {
      return periodType === PeriodType.OVERTIME ? 'OT' : 'IN';
    }

    // Handle transition cases
    if (
      transition &&
      attendanceStatus.checkStatus === CheckStatus.CHECKED_OUT
    ) {
      return transition.targetType === PeriodType.OVERTIME ? 'OT' : 'IN';
    }

    return periodType === PeriodType.OVERTIME ? 'OT' : 'OUT';
  }, [attendanceStatus, periodType, systemState, transition, isCheckingIn]);

  const buttonStyle = React.useMemo(() => {
    const baseStyle =
      'h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg';

    if (!systemState.isReady || !validation.canProceed) {
      return `${baseStyle} bg-gray-200 cursor-not-allowed`;
    }

    // Style based on period and state
    if (
      periodType === PeriodType.OVERTIME ||
      transition?.targetType === PeriodType.OVERTIME
    ) {
      return `${baseStyle} bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800`;
    }

    return `${baseStyle} bg-red-600 hover:bg-red-700 active:bg-red-800`;
  }, [periodType, systemState.isReady, validation.canProceed, transition]);

  const handleAction = React.useCallback(async () => {
    if (!validation.canProceed || !systemState.isReady) return;

    // Handle confirmation if needed
    if (validation.requireConfirmation) {
      const confirmed = window.confirm(
        validation.confirmationMessage || 'Confirm action?',
      );
      if (!confirmed) return;
    }

    // Handle transitions
    if (
      transition &&
      attendanceStatus.checkStatus === CheckStatus.CHECKED_OUT
    ) {
      if (onTransitionRequested) {
        onTransitionRequested();
        return;
      }
    }

    onActionTriggered();
  }, [
    validation,
    systemState.isReady,
    transition,
    attendanceStatus,
    onActionTriggered,
    onTransitionRequested,
  ]);

  return (
    <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
      {/* Status Messages */}
      {(validation.message || systemState.error || periodWindow) && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              {systemState.error && <p>{systemState.error}</p>}
              {validation.message && (
                <p className="whitespace-pre-line">{validation.message}</p>
              )}
              {periodWindow && !validation.message && !systemState.error && (
                <p>
                  {periodType === PeriodType.OVERTIME
                    ? 'ช่วงเวลาทำงานล่วงเวลา'
                    : 'ช่วงเวลาทำงานปกติ'}
                  {`: ${formatSafeTime(periodWindow.start)} - ${formatSafeTime(periodWindow.end)} น.`}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Action Button */}
      <button
        onClick={handleAction}
        disabled={!validation.canProceed || !systemState.isReady}
        className={buttonStyle}
        aria-label={`Attendance action: ${buttonLabel}`}
      >
        <span
          className={`text-2xl font-semibold ${
            !validation.canProceed || !systemState.isReady
              ? 'text-gray-600'
              : 'text-white'
          }`}
        >
          {buttonLabel}
        </span>
      </button>

      {/* Period Transition Info */}
      {transition && transition.availableAt && (
        <div className="mt-2 text-xs text-gray-500">
          {transition.targetType === PeriodType.OVERTIME ? (
            <>
              เริ่มทำงานล่วงเวลาเวลา {formatSafeTime(transition.availableAt)} น.
            </>
          ) : (
            <>เริ่มกะปกติเวลา {formatSafeTime(transition.availableAt)} น.</>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useMemo } from 'react';
import { AlertCircle, Clock, ArrowRight } from 'lucide-react';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { formatSafeTime } from '@/shared/timeUtils';
import { getCurrentTime } from '@/utils/dateUtils';
import { ExtendedValidation, TransitionInfo } from '@/types/attendance';
import { parseISO, format, subMinutes, isWithinInterval } from 'date-fns';

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
  validation: ExtendedValidation & {
    message?: string;
    canProceed: boolean;
  };
  systemState: {
    isReady: boolean;
    locationValid: boolean;
    error?: string;
  };
  transition?: TransitionInfo;
  onActionTriggered: () => void;
  onTransitionRequested?: () => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  attendanceStatus,
  periodType,
  periodWindow,
  validation,
  systemState,
  transition,
  onActionTriggered,
  onTransitionRequested,
}) => {
  const baseButtonStyle =
    'rounded-full flex items-center justify-center transition-all duration-300 shadow-lg';
  const buttonDisabledStyle = 'bg-gray-200 cursor-not-allowed text-gray-600';
  const buttonEnabledStyle = (type: 'regular' | 'overtime') =>
    type === 'regular'
      ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white'
      : 'bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white';

  // Simplified disabled state
  const isDisabled = useMemo(() => {
    const isOvertimeCheckedIn =
      periodType === PeriodType.OVERTIME &&
      attendanceStatus.checkStatus === CheckStatus.CHECKED_IN;

    const canProceed =
      validation.canProceed !== undefined
        ? validation.canProceed
        : validation.allowed;

    console.log('Button disable check:', {
      periodType,
      isOvertimeCheckedIn,
      checkStatus: attendanceStatus.checkStatus,
      validation: {
        canProceed,
        allowed: validation.allowed,
      },
      systemReady: systemState.isReady,
    });

    return isOvertimeCheckedIn
      ? !systemState.isReady
      : !canProceed || !systemState.isReady;
  }, [
    periodType,
    attendanceStatus.checkStatus,
    validation.canProceed,
    validation.allowed,
    systemState.isReady,
  ]);

  // Enhanced transition state check
  const transitionState = useMemo(() => {
    const now = getCurrentTime();

    // Only check transition if required and we have metadata
    if (
      !validation.flags.requiresTransition ||
      !validation.metadata?.transitionWindow ||
      !transition
    ) {
      return null;
    }

    const windowStart = parseISO(validation.metadata.transitionWindow.start);
    const windowEnd = parseISO(validation.metadata.transitionWindow.end);

    // Check if we're in the exact transition window
    const isInExactWindow = isWithinInterval(now, {
      start: windowStart,
      end: windowEnd,
    });

    // Check if we just completed regular shift
    const isAtShiftEnd =
      transition.isInTransition &&
      validation.metadata.requiredAction === 'TRANSITION_REQUIRED' &&
      transition.to.type === PeriodType.OVERTIME;

    if (isInExactWindow || isAtShiftEnd) {
      return {
        type: 'transition',
        isCheckout: attendanceStatus.checkStatus === CheckStatus.CHECKED_IN,
        targetPeriod: transition.to.type,
      };
    }

    return null;
  }, [
    validation.flags.requiresTransition,
    validation.metadata,
    transition,
    attendanceStatus.checkStatus,
  ]);

  // Early overtime approach check
  const isApproachingOvertime = useMemo(() => {
    // Case 1: Regular transition to overtime
    if (transition?.to.start) {
      const now = getCurrentTime();
      const overtimeStart = parseISO(
        `${format(now, 'yyyy-MM-dd')}T${transition.to.start}`,
      );
      const approachWindow = subMinutes(overtimeStart, 30);
      return now >= approachWindow && now < overtimeStart;
    }

    // Case 2: Early morning overtime check-in
    if (periodType === PeriodType.OVERTIME && periodWindow?.start) {
      return attendanceStatus.checkStatus !== CheckStatus.CHECKED_IN;
    }

    return false;
  }, [
    transition?.to.start,
    periodType,
    periodWindow?.start,
    attendanceStatus.checkStatus,
  ]);

  const renderButtonContent = (
    type: 'regular' | 'overtime' | 'transition',
    isCheckIn: boolean,
  ) => {
    if (type === 'transition') {
      return (
        <div className="flex flex-col items-center leading-tight">
          <span className="text-white text-sm">ออก+OT</span>
          <ArrowRight className="h-6 w-6 text-white" />
        </div>
      );
    }

    if (type === 'overtime') {
      return (
        <div className="flex flex-col items-center leading-tight">
          <span className="text-white text-sm">
            {isCheckIn ? 'เข้า' : 'ออก'}
          </span>
          <span className="text-white text-xl font-semibold -mt-1">OT</span>
        </div>
      );
    }

    return (
      <span className="text-white text-2xl font-semibold">
        {isCheckIn ? 'IN' : 'OUT'}
      </span>
    );
  };

  const handleClick = () => {
    if (isDisabled) return;

    if (transitionState?.type === 'transition') {
      onTransitionRequested?.();
    } else {
      onActionTriggered();
    }
  };

  const StatusMessages = () => {
    // Don't show regular messages during transition
    if (transitionState?.type === 'transition') {
      return (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-yellow-500 flex-shrink-0" />
            <div className="text-sm text-yellow-800">
              ลงเวลาออกและเริ่มทำ OT
            </div>
          </div>
        </div>
      );
    }

    return (
      <>
        {(validation.message || systemState.error) && (
          <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                {systemState.error && <p>{systemState.error}</p>}
                {validation.message && (
                  <p className="whitespace-pre-line">{validation.message}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  };

  // Approaching overtime view
  if (isApproachingOvertime) {
    return (
      <div className="fixed left-0 right-0 bottom-0 mb-safe flex flex-col items-center bg-gray-50 pb-12">
        <div className="text-sm text-yellow-600 flex items-center gap-1 mb-2">
          <Clock size={16} />
          <span>กำลังจะถึงเวลา OT</span>
        </div>
        <button
          disabled={isDisabled}
          className={`h-20 w-20 ${baseButtonStyle} ${
            isDisabled ? buttonDisabledStyle : buttonEnabledStyle('overtime')
          }`}
          onClick={handleClick}
        >
          {renderButtonContent('overtime', true)}
        </button>
      </div>
    );
  }

  // Combined regular/transition view
  return (
    <div className="fixed left-0 right-0 bottom-0 mb-safe flex flex-col items-center bg-gray-50 pb-12">
      <StatusMessages />
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`h-20 w-20 ${baseButtonStyle} ${
          isDisabled
            ? buttonDisabledStyle
            : buttonEnabledStyle(
                transitionState?.type === 'transition'
                  ? 'overtime'
                  : periodType === PeriodType.OVERTIME
                    ? 'overtime'
                    : 'regular',
              )
        }`}
      >
        {renderButtonContent(
          transitionState?.type === 'transition'
            ? 'transition'
            : periodType === PeriodType.OVERTIME
              ? 'overtime'
              : 'regular',
          attendanceStatus.checkStatus !== CheckStatus.CHECKED_IN,
        )}
      </button>
    </div>
  );
};

export default ActionButton;

// ActionButton.tsx
import React, { useEffect, useMemo } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { formatSafeTime } from '@/shared/timeUtils';
import { format, parseISO } from 'date-fns';
import { TransitionInfo } from '@/types/attendance';

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
  transition?: TransitionInfo; // Change from current type to TransitionInfo

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
  // Base button styling
  const baseButtonStyle =
    'rounded-full flex items-center justify-center transition-all duration-300 shadow-lg';
  const buttonDisabledStyle = 'bg-gray-200 cursor-not-allowed text-gray-600';
  const buttonEnabledStyle = (type: 'regular' | 'overtime') =>
    type === 'regular'
      ? 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white'
      : 'bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white';

  const isTransitionToRegular = useMemo(() => {
    return transition?.to.type === PeriodType.REGULAR;
  }, [transition]);

  const isTransitionToOvertime = useMemo(() => {
    return transition?.to.type === PeriodType.OVERTIME;
  }, [transition]);

  // Determine if we're in transition period
  const isTransitionPeriod = useMemo(() => {
    return (
      attendanceStatus.checkStatus === CheckStatus.CHECKED_IN &&
      transition?.isInTransition &&
      transition.to.type === PeriodType.OVERTIME &&
      transition.to.start
    );
  }, [attendanceStatus.checkStatus, transition]);

  // Determine if button should be disabled
  const isDisabled = !validation.canProceed || !systemState.isReady;

  // Handle regular button click
  const handleRegularClick = () => {
    if (isDisabled) return;
    onActionTriggered();
  };

  // Handle overtime button click
  const handleOvertimeClick = () => {
    if (isDisabled) return;
    onTransitionRequested?.();
  };

  // Status Messages Component
  const StatusMessages = () => (
    <>
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
    </>
  );

  const renderButtonContent = (
    type: 'regular' | 'overtime',
    isCheckIn: boolean,
  ) => {
    // When transitioning to regular shift
    if (type === 'overtime' && isTransitionToRegular) {
      return (
        <div className="flex flex-col items-center leading-tight">
          <span className="text-white text-sm">เข้ากะ</span>
          <span className="text-white text-xl font-semibold -mt-1">ปกติ</span>
        </div>
      );
    }

    // Regular overtime transition or normal buttons
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

    // Regular button
    return (
      <span className="text-white text-2xl font-semibold">
        {isCheckIn ? 'เข้า' : 'ออก'}
      </span>
    );
  };

  // Main button rendering
  const renderButtons = () => {
    if (isTransitionPeriod) {
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-yellow-600 flex items-center gap-1">
            <Clock size={16} />
            <span>ทำงานล่วงเวลา</span>
          </div>

          <div className="flex gap-2">
            {/* Regular checkout button */}
            <button
              onClick={handleRegularClick}
              disabled={isDisabled}
              className={`h-20 w-20 rounded-l-full ${baseButtonStyle} ${
                isDisabled ? buttonDisabledStyle : buttonEnabledStyle('regular')
              }`}
              aria-label="Regular checkout"
            >
              {renderButtonContent('regular', false)}
            </button>

            {/* Overtime button */}
            <button
              onClick={handleOvertimeClick}
              disabled={isDisabled}
              className={`h-20 w-20 rounded-r-full ${baseButtonStyle} ${
                isDisabled
                  ? buttonDisabledStyle
                  : buttonEnabledStyle('overtime')
              }`}
              aria-label="Start overtime"
            >
              {renderButtonContent('overtime', true)}
            </button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            {isTransitionToOvertime
              ? 'เลือก: ออกงานปกติ หรือ ทำงานล่วงเวลาต่อ'
              : 'เลือก: ออกล่วงเวลา หรือ เข้ากะปกติ'}
          </div>
        </div>
      );
    }

    // Regular single button
    const isCheckingIn =
      attendanceStatus.checkStatus !== CheckStatus.CHECKED_IN;
    return (
      <button
        onClick={handleRegularClick}
        disabled={isDisabled}
        className={`h-20 w-20 ${baseButtonStyle} ${
          isDisabled
            ? buttonDisabledStyle
            : buttonEnabledStyle(
                periodType === PeriodType.OVERTIME ? 'overtime' : 'regular',
              )
        }`}
        aria-label={`Attendance action: ${isCheckingIn ? 'check in' : 'check out'}`}
      >
        {renderButtonContent(
          periodType === PeriodType.OVERTIME ? 'overtime' : 'regular',
          isCheckingIn,
        )}
      </button>
    );
  };

  return (
    <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
      <StatusMessages />
      {renderButtons()}

      {/* Period Transition Info */}
      {transition && !isTransitionPeriod && (
        <div className="mt-2 text-xs text-gray-500">
          {transition.to.type === PeriodType.OVERTIME ? (
            <>
              เริ่มทำงานล่วงเวลาเวลา{' '}
              {transition.to.start
                ? format(parseISO(transition.to.start), 'HH:mm')
                : '--:--'}{' '}
              น.
            </>
          ) : (
            <>
              เริ่มกะปกติเวลา{' '}
              {transition.to.start
                ? format(parseISO(transition.to.start), 'HH:mm')
                : '--:--'}{' '}
              น.
            </>
          )}
        </div>
      )}
    </div>
  );
};

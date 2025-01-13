import React, { useEffect, useMemo } from 'react';
import { AlertCircle, Clock, XCircle } from 'lucide-react';
import {
  AttendanceState,
  CheckStatus,
  OvertimeState,
  PeriodType,
} from '@prisma/client';
import { formatSafeTime } from '@/shared/timeUtils';
import { getCurrentTime } from '@/utils/dateUtils';
import { ExtendedValidation, TransitionInfo } from '@/types/attendance';
import { parseISO, format, subMinutes } from 'date-fns';

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
    // Extend the validation type
    message?: string; // Keep backward compatibility for message
    canProceed: boolean;
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

  const isTransitionToRegular = transition?.to.type === PeriodType.REGULAR;
  const isTransitionToOvertime = transition?.to.type === PeriodType.OVERTIME;
  const isEarlyOvertimePeriod =
    periodWindow?.start &&
    periodType === PeriodType.OVERTIME &&
    parseISO(periodWindow.start) <
      parseISO(`${format(getCurrentTime(), 'yyyy-MM-dd')}T08:00:00`);

  const isDisabled = useMemo(() => {
    // Special handling for overtime periods
    if (periodType === PeriodType.OVERTIME) {
      const isOvertimeCheckedIn =
        attendanceStatus.checkStatus === CheckStatus.CHECKED_IN;

      // Allow overtime checkout even after end time if checked in
      if (isOvertimeCheckedIn) {
        return !systemState.isReady;
      }
    }

    // Default validation - support both old and new validation
    return (
      !(validation.canProceed ?? validation.allowed) || !systemState.isReady
    );
  }, [
    periodType,
    attendanceStatus.checkStatus,
    validation.canProceed,
    validation.allowed,
    systemState.isReady,
  ]);

  // Determine if we're in transition period
  const isTransitionPeriod = useMemo(() => {
    return (
      attendanceStatus.checkStatus === CheckStatus.CHECKED_IN &&
      transition?.isInTransition &&
      transition.to.type === PeriodType.OVERTIME &&
      transition.to.start
    );
  }, [attendanceStatus.checkStatus, transition]);

  // Add explicit transition state check
  const isInTransitionState = useMemo(() => {
    return (
      validation.flags.requiresTransition &&
      validation.flags.hasPendingTransition &&
      attendanceStatus.checkStatus === CheckStatus.CHECKED_IN
    );
  }, [validation.flags, attendanceStatus.checkStatus]);

  // Handle regular button click with overtime support
  const handleRegularClick = () => {
    if (isDisabled) return;

    // Skip confirmation for overtime checkout
    const isOvertimeCheckout =
      periodType === PeriodType.OVERTIME &&
      attendanceStatus.checkStatus === CheckStatus.CHECKED_IN;

    if (isOvertimeCheckout) {
      onActionTriggered();
      return;
    }

    onActionTriggered();
  };

  // Handle overtime button click
  const handleOvertimeClick = () => {
    if (isDisabled) return;
    onTransitionRequested?.();
  };

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

    // Handle transition to overtime
    if (type === 'overtime' && isTransitionToOvertime) {
      const isEarlyOvertimeTransition =
        transition?.to.start &&
        parseISO(
          `${format(getCurrentTime(), 'yyyy-MM-dd')}T${transition.to.start}`,
        ) <
          parseISO(
            `${format(getCurrentTime(), 'yyyy-MM-dd')}T${transition.from.end}`,
          );

      return (
        <div className="flex flex-col items-center leading-tight">
          <span className="text-white text-sm">
            {isEarlyOvertimeTransition ? 'เริ่ม OT' : 'เข้า OT'}
          </span>
        </div>
      );
    }

    // Enhanced overtime button content
    if (type === 'overtime') {
      const now = getCurrentTime();
      const isPastEndTime =
        periodWindow?.end && now > new Date(periodWindow.end);
      const isOvertimeCheckedIn =
        attendanceStatus.checkStatus === CheckStatus.CHECKED_IN;

      // Special display for early overtime period
      if (isEarlyOvertimePeriod) {
        return (
          <div className="flex flex-col items-center leading-tight">
            <span className="text-white text-sm">
              {isCheckIn ? 'เริ่ม OT' : 'ออก OT'}
            </span>
            <span className="text-white text-xl font-semibold -mt-1">OT</span>
          </div>
        );
      }

      // Special display for overtime checkout after end time
      if (isOvertimeCheckedIn && isPastEndTime) {
        return (
          <div className="flex flex-col items-center leading-tight">
            <span className="text-white text-sm">ออกงาน</span>
            <span className="text-white text-xl font-semibold -mt-1">OT</span>
          </div>
        );
      }

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

  const StatusMessages = () => {
    if (isInTransitionState) return null;

    return (
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
                    {isEarlyOvertimePeriod
                      ? 'ช่วงเวลาทำงานล่วงเวลาก่อนเวลาทำงานปกติ'
                      : periodType === PeriodType.OVERTIME
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
  };

  const isApproachingOvertime = () => {
    if (!transition?.to.start) return false;
    const now = getCurrentTime();
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${transition.to.start}`,
    );
    const approachWindow = subMinutes(overtimeStart, 30);
    return now >= approachWindow && now < overtimeStart;
  };

  // Update the renderButtons method to handle early morning cases
  const renderButtons = () => {
    // Don't allow regular check-in during very early morning hours
    // If we're waiting for overtime and disabled
    // Update this part
    if (validation.flags.isPendingOvertime && isDisabled) {
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-yellow-600 flex items-center gap-1">
            <Clock size={16} />
            <span>รอเวลา OT</span>
          </div>
          <button
            disabled={true}
            className={`h-20 w-20 ${baseButtonStyle} ${buttonDisabledStyle}`}
            aria-label="Waiting for overtime"
          >
            <div className="flex flex-col items-center leading-tight">
              <span className="text-gray-600 text-2xl font-semibold">
                {formatSafeTime(periodWindow?.start)}
              </span>
            </div>
          </button>
          {validation.message && (
            <div className="text-xs text-gray-500 text-center mt-1">
              {validation.message}
            </div>
          )}
        </div>
      );
    }

    // Handle approaching overtime period
    if (isApproachingOvertime() && !isInTransitionState) {
      return (
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm text-yellow-600 flex items-center gap-1">
            <Clock size={16} />
            <span>กำลังจะถึงเวลา OT</span>
          </div>
          <button
            disabled={isDisabled}
            className={`h-20 w-20 ${baseButtonStyle} ${
              isDisabled ? buttonDisabledStyle : buttonEnabledStyle('overtime')
            }`}
            onClick={handleOvertimeClick}
          >
            {renderButtonContent('overtime', true)}
          </button>
        </div>
      );
    }
    // Prioritize transition state rendering
    if (isInTransitionState) {
      return (
        <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
          {/* Status Messages specific to transition state */}
          <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                กำลังเปลี่ยนช่วงเวลาทำงาน เลือกการดำเนินการ
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <div className="text-sm text-yellow-600 flex items-center gap-1">
              <Clock size={16} />
              <span>ช่วงเวลาทำงานล่วงเวลา</span>
            </div>

            <div className="flex gap-2">
              {/* Regular checkout button */}
              <button
                onClick={handleRegularClick}
                disabled={!systemState.isReady}
                className={`h-20 w-20 rounded-l-full ${baseButtonStyle} relative ${
                  !systemState.isReady
                    ? buttonDisabledStyle
                    : buttonEnabledStyle('regular')
                }`}
                aria-label="Regular checkout"
              >
                {!systemState.isReady && (
                  <XCircle className="absolute -top-2 -right-2 w-6 h-6 text-gray-400 bg-white rounded-full" />
                )}
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-white text-sm">ออกงาน</span>
                  <span className="text-white text-xl font-semibold -mt-1">
                    ปกติ
                  </span>
                </div>
              </button>

              {/* Overtime button */}
              <button
                onClick={handleOvertimeClick}
                disabled={!systemState.isReady}
                className={`h-20 w-20 rounded-r-full ${baseButtonStyle} relative ${
                  !systemState.isReady
                    ? buttonDisabledStyle
                    : buttonEnabledStyle('overtime')
                }`}
                aria-label="Start overtime"
              >
                {!systemState.isReady && (
                  <XCircle className="absolute -top-2 -right-2 w-6 h-6 text-gray-400 bg-white rounded-full" />
                )}
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-white text-sm">เข้างาน</span>
                  <span className="text-white text-xl font-semibold -mt-1">
                    OT
                  </span>
                </div>
              </button>
            </div>

            <div className="text-xs text-gray-500 text-center">
              เลือก: ออกงานปกติ หรือ ทำงานล่วงเวลาต่อ
            </div>
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
        <div className="flex flex-col items-center leading-tight">
          <span
            className={`text-2xl font-semibold ${isDisabled ? 'text-gray-600' : 'text-white'}`}
          >
            {formatSafeTime(periodWindow?.start)}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
      <StatusMessages />
      {renderButtons()}
    </div>
  );
};

export default ActionButton;

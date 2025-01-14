import React, { useMemo } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
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

  // Simplified overtime check
  const isEarlyOvertimePeriod = useMemo(() => {
    if (!periodWindow?.start || periodType !== PeriodType.OVERTIME)
      return false;
    const start = parseISO(periodWindow.start);
    const shiftStart = parseISO(
      `${format(getCurrentTime(), 'yyyy-MM-dd')}T08:00:00`,
    );
    return start < shiftStart;
  }, [periodWindow?.start, periodType]);

  // Simplified disabled state
  const isDisabled = useMemo(() => {
    const isOvertimeCheckedIn =
      periodType === PeriodType.OVERTIME &&
      attendanceStatus.checkStatus === CheckStatus.CHECKED_IN;

    return isOvertimeCheckedIn
      ? !systemState.isReady
      : !(validation.canProceed ?? validation.allowed) || !systemState.isReady;
  }, [
    periodType,
    attendanceStatus.checkStatus,
    validation.canProceed,
    validation.allowed,
    systemState.isReady,
  ]);

  // Transition state check
  const isInTransitionState = useMemo(() => {
    return (
      validation.flags.requiresTransition &&
      validation.flags.hasPendingTransition &&
      attendanceStatus.checkStatus === CheckStatus.CHECKED_IN
    );
  }, [validation.flags, attendanceStatus.checkStatus]);

  // Approaching overtime check with better date handling
  const isApproachingOvertime = useMemo(() => {
    if (!transition?.to.start) return false;
    const now = getCurrentTime();
    const overtimeStart = parseISO(
      `${format(now, 'yyyy-MM-dd')}T${transition.to.start}`,
    );
    const approachWindow = subMinutes(overtimeStart, 30);
    return now >= approachWindow && now < overtimeStart;
  }, [transition?.to.start]);

  const renderButtonContent = (
    type: 'regular' | 'overtime',
    isCheckIn: boolean,
  ) => {
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
        {isCheckIn ? 'เข้า' : 'ออก'}
      </span>
    );
  };

  const handleRegularClick = () => {
    if (isDisabled) return;
    onActionTriggered();
  };

  const handleOvertimeClick = () => {
    if (isDisabled) return;
    onTransitionRequested?.();
  };

  const StatusMessages = () => {
    if (isInTransitionState) return null;

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

  if (isInTransitionState) {
    return (
      <div className="fixed left-0 right-0 bottom-0 mb-safe flex flex-col items-center bg-gray-50 pb-12">
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              กำลังเปลี่ยนช่วงเวลาทำงาน เลือกการดำเนินการ
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRegularClick}
            disabled={!systemState.isReady}
            className={`h-20 w-20 rounded-l-full ${baseButtonStyle} ${
              !systemState.isReady
                ? buttonDisabledStyle
                : buttonEnabledStyle('regular')
            }`}
          >
            {renderButtonContent('regular', false)}
          </button>
          <button
            onClick={handleOvertimeClick}
            disabled={!systemState.isReady}
            className={`h-20 w-20 rounded-r-full ${baseButtonStyle} ${
              !systemState.isReady
                ? buttonDisabledStyle
                : buttonEnabledStyle('overtime')
            }`}
          >
            {renderButtonContent('overtime', true)}
          </button>
        </div>
      </div>
    );
  }

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
          onClick={handleOvertimeClick}
        >
          {renderButtonContent('overtime', true)}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed left-0 right-0 bottom-0 mb-safe flex flex-col items-center bg-gray-50 pb-12">
      {' '}
      <StatusMessages />
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
      >
        {renderButtonContent(
          periodType === PeriodType.OVERTIME ? 'overtime' : 'regular',
          attendanceStatus.checkStatus !== CheckStatus.CHECKED_IN,
        )}
      </button>
    </div>
  );
};

export default ActionButton;

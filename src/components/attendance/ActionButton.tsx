import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import React from 'react';
import { AlertCircle } from 'lucide-react';

type AttendanceAction = {
  type: 'check-in' | 'check-out';
  period: {
    type: 'regular' | 'overtime';
    transition?: {
      to: 'regular' | 'overtime';
      at: Date;
    };
  };
  timing?: {
    plannedTime: Date;
    isEarly?: boolean;
    isLate?: boolean;
  };
};

type ValidationState = {
  canProceed: boolean;
  message?: string;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
};

interface AttendanceActionButtonProps {
  // Core attendance action context
  action: AttendanceAction;

  // Validation and requirements
  validation: ValidationState;

  // Device/System state
  systemState: {
    isReady: boolean;
    locationValid: boolean;
    error?: string;
  };

  // Callbacks
  onActionTriggered: () => void;
  onTransitionInitiated?: () => void;
}

export const AttendanceActionButton: React.FC<AttendanceActionButtonProps> = ({
  action,
  validation,
  systemState,
  onActionTriggered,
  onTransitionInitiated,
}) => {
  const buttonLabel = React.useMemo(() => {
    if (!systemState.isReady) return '...';
    if (!systemState.locationValid) return '!';

    switch (action.type) {
      case 'check-in':
        return action.period.type === 'overtime' ? 'IN' : 'IN';
      case 'check-out':
        if (action.period.transition) {
          return action.period.type === 'regular' ? 'OUT' : 'OUT';
        }
        return action.period.type === 'overtime' ? 'OUT' : 'OUT';
    }
  }, [action, systemState]);

  const buttonStyle = React.useMemo(() => {
    const baseStyle =
      'h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg';

    if (!systemState.isReady || !validation.canProceed) {
      return `${baseStyle} bg-gray-200 cursor-not-allowed`;
    }

    // Styles based on period and action type
    switch (action.period.type) {
      case 'overtime':
        return `${baseStyle} bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800`;
      default:
        return `${baseStyle} bg-red-600 hover:bg-red-700 active:bg-red-800`;
    }
  }, [action.period.type, systemState.isReady, validation.canProceed]);

  const handleAction = React.useCallback(async () => {
    if (!validation.canProceed || !systemState.isReady) return;

    if (validation.requireConfirmation) {
      const confirmed = window.confirm(
        validation.confirmationMessage || 'Confirm action?',
      );
      if (!confirmed) return;
    }

    if (action.period.transition && onTransitionInitiated) {
      onTransitionInitiated();
    }

    onActionTriggered();
  }, [
    validation,
    systemState.isReady,
    action,
    onActionTriggered,
    onTransitionInitiated,
  ]);

  return (
    <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
      {/* Status Messages */}
      {(validation.message || systemState.error || action.timing) && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              {systemState.error && <p>{systemState.error}</p>}
              {validation.message && <p>{validation.message}</p>}
              {action.timing && (
                <div>
                  <p>
                    เวลาทำงาน:{' '}
                    {format(action.timing.plannedTime, 'HH:mm', { locale: th })}
                  </p>
                </div>
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

      {/* Period Transition Indicator */}
      {action.period.transition && (
        <div className="mt-2 text-xs text-gray-500">
          {`${action.period.transition.to === 'overtime' ? 'Overtime' : 'Regular shift'} 
           at ${format(action.period.transition.at, 'HH:mm', { locale: th })}`}
        </div>
      )}
    </div>
  );
};

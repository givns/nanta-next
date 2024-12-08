import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ActionButtonProps {
  isEnabled: boolean;
  validationMessage?: string;
  nextWindowTime?: Date;
  isCheckingIn: boolean;
  onAction: () => void;
  locationState: {
    isReady: boolean;
    error?: string;
  };
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  isEnabled,
  validationMessage,
  nextWindowTime,
  isCheckingIn,
  onAction,
  locationState,
}) => {
  const buttonText = React.useMemo(() => {
    if (!locationState.isReady) return '...';
    if (locationState.error) return '!';
    return isCheckingIn ? 'IN' : 'OUT';
  }, [isCheckingIn, locationState]);

  const buttonStateClass = React.useMemo(() => {
    if (!locationState.isReady) {
      return 'bg-gray-400 cursor-wait animate-pulse';
    }
    if (!isEnabled) {
      return 'bg-gray-100 border-2 border-red-300 cursor-not-allowed';
    }
    return 'bg-red-600 hover:bg-red-700 active:bg-red-800 floating-button';
  }, [isEnabled, locationState.isReady]);

  return (
    <div className="fixed left-0 right-0 bottom-12 mb-safe flex flex-col items-center">
      {/* Single validation message format for all cases */}
      {(validationMessage || locationState.error || nextWindowTime) && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 max-w-[280px]">
          <div className="flex gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-yellow-800">
              {locationState.error && <p>{locationState.error}</p>}
              {validationMessage && <p>{validationMessage}</p>}
              {nextWindowTime && (
                <p>
                  สามารถลงเวลาได้:{' '}
                  {format(nextWindowTime, 'HH:mm', { locale: th })}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Circle button */}
      <button
        onClick={onAction}
        disabled={!isEnabled || !locationState.isReady}
        className={`h-20 w-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${buttonStateClass}`}
        aria-label={`เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
      >
        <span
          className={`text-2xl font-semibold ${!isEnabled ? 'text-red-500' : 'text-white'}`}
        >
          {buttonText}
        </span>
      </button>
    </div>
  );
};

import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import React from 'react';

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

  // Enhanced visual feedback
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
    <div className="fixed right-4 bottom-12 mb-safe space-y-3 flex flex-col items-end">
      {/* Enhanced feedback message */}
      {(validationMessage || locationState.error || nextWindowTime) && (
        <div className="floating-button-message bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg max-w-[280px] text-sm">
          {!isEnabled && validationMessage && (
            <p className="text-red-600 font-medium mb-1">{validationMessage}</p>
          )}
          {isEnabled && validationMessage && (
            <p className="text-gray-700">{validationMessage}</p>
          )}
          {locationState.error && (
            <p className="text-yellow-600">{locationState.error}</p>
          )}
          {nextWindowTime && (
            <p className="text-blue-600 mt-1 font-medium">
              สามารถลงเวลาได้: {format(nextWindowTime, 'HH:mm', { locale: th })}
            </p>
          )}
        </div>
      )}

      {/* Improved button with better spacing */}
      <button
        onClick={onAction}
        disabled={!isEnabled || !locationState.isReady}
        className={`h-14 w-14 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${buttonStateClass}`}
        aria-label={`เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
      >
        <span
          className={`text-lg font-medium ${!isEnabled ? 'text-red-500' : 'text-white'}`}
        >
          {buttonText}
        </span>
      </button>
    </div>
  );
};

import React from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

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
    if (!isEnabled || !locationState.isReady) {
      return 'bg-gray-400 cursor-not-allowed hover:scale-100';
    }
    return 'bg-red-600 hover:bg-red-700 hover:scale-105 active:scale-95';
  }, [isEnabled, locationState.isReady]);

  return (
    <div className="fixed right-4 bottom-safe space-y-2 flex flex-col items-end">
      {(validationMessage || locationState.error || nextWindowTime) && (
        <div className="bg-white/95 backdrop-blur p-3 rounded-xl shadow-lg max-w-[280px] text-sm mb-3 transition-all">
          {validationMessage && (
            <p className="text-gray-700">{validationMessage}</p>
          )}
          {locationState.error && (
            <p className="text-yellow-600">{locationState.error}</p>
          )}
          {nextWindowTime && (
            <p className="text-blue-600 mt-1">
              สามารถลงเวลาได้: {format(nextWindowTime, 'HH:mm', { locale: th })}
            </p>
          )}
        </div>
      )}

      <button
        onClick={onAction}
        disabled={!isEnabled || !locationState.isReady}
        className={`h-16 w-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 ${buttonStateClass}`}
        aria-label={`เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`}
      >
        <span className="text-white text-xl font-medium">{buttonText}</span>
      </button>
    </div>
  );
};

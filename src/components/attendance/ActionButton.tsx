import React from 'react';

interface ActionButtonProps {
  isEnabled: boolean;
  validationMessage?: string;
  isCheckingIn: boolean;
  onAction: () => void;
  className?: string;
  locationState: {
    isReady: boolean;
    error?: string;
  };
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  isEnabled,
  validationMessage,
  isCheckingIn,
  onAction,
  className = '',
  locationState,
}) => {
  // Get button text based on state
  const buttonText = React.useMemo(() => {
    if (!locationState.isReady) {
      return 'กำลังตรวจสอบตำแหน่ง...';
    }

    if (locationState.error) {
      return 'ไม่สามารถระบุตำแหน่งได้';
    }

    return `เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
  }, [isCheckingIn, locationState]);

  // Determine button state classes
  const buttonStateClass = React.useMemo(() => {
    if (!isEnabled || !locationState.isReady) {
      return 'bg-gray-400 cursor-not-allowed';
    }
    return 'bg-primary hover:bg-primary-dark active:bg-primary-darker';
  }, [isEnabled, locationState.isReady]);

  return (
    <div className="space-y-2">
      {validationMessage && (
        <div className="text-sm text-center mb-2 text-red-600">
          {validationMessage}
        </div>
      )}

      {locationState.error && (
        <div className="text-sm text-center mb-2 text-yellow-600">
          {locationState.error}
        </div>
      )}

      <button
        onClick={onAction}
        disabled={!isEnabled || !locationState.isReady}
        className={`w-full ${buttonStateClass} text-white py-3 px-4 rounded-lg transition duration-300 ${className}`}
        aria-label={buttonText}
      >
        {buttonText}
      </button>
    </div>
  );
};

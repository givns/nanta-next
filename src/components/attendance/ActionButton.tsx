import React from 'react';
import { CheckInOutAllowance } from '@/types/attendance';

interface ActionButtonProps {
  isLoading: boolean;
  isActionButtonReady: boolean;
  checkInOutAllowance: CheckInOutAllowance | null;
  isCheckingIn: boolean;
  isDayOff?: boolean;
  onAction: (action: 'checkIn' | 'checkOut') => void;
  locationReady?: boolean; // Add new prop
}

const ActionButton: React.FC<ActionButtonProps> = ({
  isLoading,
  isActionButtonReady,
  checkInOutAllowance,
  isCheckingIn,
  onAction,
  locationReady = true, // Default to true for backward compatibility
}) => {
  // Determine if button should be enabled
  const isButtonEnabled = Boolean(
    checkInOutAllowance?.allowed &&
      isActionButtonReady &&
      locationReady &&
      !isLoading,
  );

  // Dynamic button classes
  const buttonClass = `w-full ${
    isButtonEnabled
      ? 'bg-primary hover:bg-primary-dark'
      : 'bg-gray-400 cursor-not-allowed'
  } text-white py-3 px-4 rounded-lg transition duration-300`;

  // Get button text based on state
  const getButtonText = () => {
    if (isLoading) return 'กรุณารอสักครู่...';
    if (!locationReady) return 'กำลังตรวจสอบตำแหน่ง...';
    if (!checkInOutAllowance?.allowed) return 'ไม่สามารถลงเวลาได้ในขณะนี้';
    return `เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
  };

  // Get status message if any
  const getStatusMessage = () => {
    if (!locationReady) return 'กำลังตรวจสอบตำแหน่งของคุณ';
    return checkInOutAllowance?.reason || null;
  };

  const statusText = getStatusMessage();

  return (
    <div className="space-y-2">
      {statusText && (
        <div className="text-sm text-center mb-2 text-red-600">
          {statusText}
        </div>
      )}
      <button
        onClick={() => onAction(isCheckingIn ? 'checkIn' : 'checkOut')}
        disabled={!isButtonEnabled}
        className={buttonClass}
        aria-label={getButtonText()}
      >
        {getButtonText()}
      </button>
    </div>
  );
};

export default ActionButton;

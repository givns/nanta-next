import React from 'react';
import { CheckInOutAllowance } from '../types/attendance';

interface ActionButtonProps {
  isLoading: boolean;
  isActionButtonReady: boolean;
  checkInOutAllowance: CheckInOutAllowance | null;
  isCheckingIn: boolean;
  isDayOff: boolean;
  onAction: (action: 'checkIn' | 'checkOut') => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  isLoading,
  isActionButtonReady,
  checkInOutAllowance,
  isCheckingIn,
  onAction,
}) => {
  const buttonClass = `w-full ${
    checkInOutAllowance?.allowed && isActionButtonReady
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-gray-400 cursor-not-allowed'
  } text-white py-3 px-4 rounded-lg transition duration-300`;

  const buttonText = isLoading
    ? 'กรุณารอสักครู่...'
    : checkInOutAllowance?.allowed
      ? `เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`
      : 'ไม่สามารถลงเวลาได้ในขณะนี้';

  return (
    <div className="space-y-2">
      <button
        onClick={() => onAction(isCheckingIn ? 'checkIn' : 'checkOut')}
        disabled={
          isLoading || !isActionButtonReady || !checkInOutAllowance?.allowed
        }
        className={buttonClass}
        aria-label={buttonText}
      >
        {buttonText}
      </button>
      {checkInOutAllowance?.reason && (
        <p className="text-center text-sm mt-2 text-gray-600">
          {checkInOutAllowance.reason}
        </p>
      )}
    </div>
  );
};

export default ActionButton;

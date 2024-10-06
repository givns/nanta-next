import React from 'react';
import { CheckInOutAllowance } from '../types/attendance';

interface ActionButtonProps {
  isLoading: boolean;
  checkInOutAllowance: CheckInOutAllowance | null;
  isCheckingIn: boolean;
  onAction: (newStatus: boolean) => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  isLoading,
  checkInOutAllowance,
  isCheckingIn,
  onAction,
}) => {
  const buttonClass = `w-full ${checkInOutAllowance?.allowed ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-400 cursor-not-allowed'} text-white py-3 px-4 rounded-lg transition duration-300`;

  let buttonText = 'ไม่สามารถลงเวลาได้ในขณะนี้';
  if (!isLoading) {
    if (checkInOutAllowance?.allowed) {
      buttonText = `เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
    } else if (checkInOutAllowance?.reason) {
      buttonText = checkInOutAllowance.reason;
    }
  } else {
    buttonText = 'กรุณารอสักครู่...';
  }

  return (
    <>
      <button
        onClick={() => onAction(isCheckingIn)}
        disabled={isLoading || !checkInOutAllowance?.allowed}
        className={buttonClass}
        aria-label={buttonText}
      >
        {buttonText}
      </button>
      {!checkInOutAllowance?.allowed && checkInOutAllowance?.reason && (
        <p className="text-red-500 text-center text-sm mt-2">
          {checkInOutAllowance.reason}
        </p>
      )}
      {checkInOutAllowance?.isOutsideShift && (
        <p className="text-yellow-500 text-center text-sm mt-2">
          คุณอยู่นอกเวลาทำงานของกะ
        </p>
      )}
      {checkInOutAllowance?.isLate && (
        <p className="text-red-500 text-center text-sm mt-2">
          คุณกำลังเข้างานสาย
        </p>
      )}
      {checkInOutAllowance?.isOvertime && (
        <p className="text-purple-500 text-center text-sm mt-2">
          คุณกำลังทำงานล่วงเวลา
        </p>
      )}
    </>
  );
};

export default ActionButton;

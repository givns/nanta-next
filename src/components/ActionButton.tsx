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
  const buttonClass = `w-full ${
    checkInOutAllowance?.allowed
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-gray-400 cursor-not-allowed'
  } text-white py-3 px-4 rounded-lg transition duration-300`;

  let buttonText = 'ไม่สามารถลงเวลาได้ในขณะนี้';
  let statusText = '';

  if (isLoading) {
    buttonText = 'กรุณารอสักครู่...';
  } else if (checkInOutAllowance) {
    if (checkInOutAllowance.allowed) {
      buttonText = `เปิดกล้องเพื่อ${isCheckingIn ? 'เข้างาน' : 'ออกงาน'}`;
      if (checkInOutAllowance.isOvertime) {
        statusText = 'คุณกำลังทำงานล่วงเวลา';
      } else if (checkInOutAllowance.isLate) {
        statusText = 'คุณกำลังเข้างานสาย';
      }
    } else {
      buttonText = checkInOutAllowance.reason || 'ไม่สามารถลงเวลาได้';
      if (checkInOutAllowance.countdown) {
        statusText = `สามารถลงเวลาได้ในอีก ${checkInOutAllowance.countdown} นาที`;
      }
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => onAction(isCheckingIn)}
        disabled={isLoading || !checkInOutAllowance?.allowed}
        className={buttonClass}
        aria-label={buttonText}
      >
        {buttonText}
      </button>
      {statusText && (
        <p
          className="text-center text-sm mt-2"
          style={{
            color: checkInOutAllowance?.isOvertime ? '#9333ea' : '#ef4444',
          }}
        >
          {statusText}
        </p>
      )}
      {checkInOutAllowance?.isOutsideShift && (
        <p className="text-yellow-500 text-center text-sm">
          คุณอยู่นอกเวลาทำงานของกะ
        </p>
      )}
      {!checkInOutAllowance?.inPremises && (
        <p className="text-red-500 text-center text-sm">
          คุณอยู่นอกสถานที่ทำงาน
        </p>
      )}
      {checkInOutAllowance?.address && (
        <p className="text-blue-500 text-center text-sm">
          สถานที่: {checkInOutAllowance.address}
        </p>
      )}
    </div>
  );
};

export default ActionButton;

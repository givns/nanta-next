// components/attendance/CompletionView.tsx
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { closeWindow } from '@/services/liff';
import { AttendanceStatusInfo } from '@/types/attendance';
import { formatCheckTime } from '@/utils/timeUtils';

interface CompletionViewProps {
  isSubmitting: boolean;
  timeRemaining: number;
  currentAttendanceStatus: AttendanceStatusInfo | null;
  isCheckingIn: boolean;
  onClose: () => void;
}

const CompletionView: React.FC<CompletionViewProps> = ({
  isSubmitting,
  timeRemaining,
  currentAttendanceStatus,
  isCheckingIn,
  onClose,
}) => {
  const [autoCloseTimer, setAutoCloseTimer] = useState<NodeJS.Timeout | null>(
    null,
  );

  useEffect(() => {
    // Set up auto-close timer
    if (!isSubmitting && timeRemaining > 0) {
      const timer = setTimeout(() => {
        try {
          onClose();
          closeWindow();
        } catch (error) {
          console.error('Error closing window:', error);
        }
      }, timeRemaining * 1000);

      setAutoCloseTimer(timer);
      return () => {
        if (timer) clearTimeout(timer);
      };
    }
  }, [isSubmitting, timeRemaining, onClose]);

  const getCheckTime = () => {
    const attendance = currentAttendanceStatus?.latestAttendance;
    if (!attendance) return null;

    const time = isCheckingIn
      ? attendance.checkInTime
      : attendance.checkOutTime;
    return time ? formatCheckTime(time) : null;
  };

  const renderStatus = () => {
    if (!currentAttendanceStatus) return null;

    return (
      <div className="px-4 py-2 bg-white shadow-sm rounded-md">
        <div className="text-sm font-medium text-gray-900">
          {isCheckingIn ? 'สถานะการลงเวลาเข้างาน' : 'สถานะการลงเวลาออกงาน'}
        </div>
        {currentAttendanceStatus.detailedStatus === 'late-check-in' && (
          <div className="mt-1 text-sm text-red-600">คุณมาสาย</div>
        )}
      </div>
    );
  };

  if (isSubmitting) {
    return (
      <div className="flex flex-col items-center justify-center p-4">
        <p className="text-lg font-semibold mb-4">ระบบกำลังลงเวลา...</p>
        <div className="w-8 h-8 border-4 border-t-blue-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  const checkTime = getCheckTime();

  return (
    <div className="flex flex-col items-center justify-center p-4 space-y-4">
      <div className="text-center space-y-2">
        <div className="text-lg font-medium">
          {isCheckingIn ? 'ลงเวลาเข้างานเรียบร้อย' : 'ลงเวลาออกงานเรียบร้อย'}
        </div>
        {checkTime && <div className="text-base">เวลา: {checkTime} น.</div>}
      </div>

      {renderStatus()}

      <p className="text-sm text-gray-600">
        ระบบจะปิดอัตโนมัติใน {timeRemaining} วินาที
      </p>
    </div>
  );
};

export default CompletionView;
